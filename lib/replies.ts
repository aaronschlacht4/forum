import { supabase } from './supabase';

export interface Reply {
  id: string;
  annotationId: string;
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  content: string;
  isAnonymous?: boolean;
  parentReplyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DBReply {
  id: string;
  annotation_id: string;
  user_id: string;
  content: string;
  is_anonymous?: boolean;
  parent_reply_id?: string;
  created_at: string;
  updated_at: string;
}

// Convert DB reply to app reply
function dbToApp(dbReply: any): Reply {
  return {
    id: dbReply.id,
    annotationId: dbReply.annotation_id,
    userId: dbReply.user_id,
    username: dbReply.username,
    displayName: dbReply.display_name,
    avatarUrl: dbReply.avatar_url,
    content: dbReply.content,
    isAnonymous: dbReply.is_anonymous || false,
    parentReplyId: dbReply.parent_reply_id,
    createdAt: dbReply.created_at,
    updatedAt: dbReply.updated_at,
  };
}

// Load replies for an annotation
export async function loadReplies(annotationId: string): Promise<Reply[]> {
  console.log('🔍 Loading replies for annotation:', annotationId);

  // Try to use the view with user info first
  let { data, error } = await supabase
    .from('replies_with_users')
    .select('*')
    .eq('annotation_id', annotationId)
    .order('created_at', { ascending: true });

  console.log('📊 View query result:', {
    dataLength: data?.length,
    firstReply: data?.[0] ? {
      display_name: data[0].display_name,
      username: data[0].username,
      is_anonymous: data[0].is_anonymous
    } : null,
    error: error?.message
  });

  // If view doesn't exist or returns null user data, fall back to manual join
  // BUT: If all replies are intentionally anonymous, the view will return 'Anonymous' as display_name
  const hasAnonymousData = data && data.length > 0 && !data[0].username && data[0].display_name === 'Anonymous';
  const shouldUseFallback = error || (data && data.length > 0 && !data[0].display_name && !data[0].username);

  if (shouldUseFallback && !hasAnonymousData) {
    console.warn('replies_with_users view not working properly, using manual join with profiles table.');

    // Get replies and manually join with profiles
    const { data: repliesData, error: repliesError } = await supabase
      .from('replies')
      .select('*')
      .eq('annotation_id', annotationId)
      .order('created_at', { ascending: true });

    if (repliesError) {
      console.error('Error loading replies:', repliesError);
      return [];
    }

    // Fetch user profiles for all replies
    const userIds = [...new Set(repliesData?.map(r => r.user_id) || [])];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, email, display_name, avatar_url')
      .in('id', userIds);

    // Create a map of user profiles
    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

    // Combine replies with profile data
    const enrichedData = repliesData?.map(reply => {
      const profile = profilesMap.get(reply.user_id);
      // Check if reply should be anonymous
      const isAnon = reply.is_anonymous === true;
      return {
        ...reply,
        username: isAnon ? null : profile?.email,
        display_name: isAnon ? 'Anonymous' : (profile?.display_name || profile?.email),
        avatar_url: isAnon ? null : profile?.avatar_url,
        is_anonymous: isAnon,
      };
    }) || [];

    return enrichedData.map(dbToApp);
  }

  if (error) {
    console.error('Error loading replies:', error);
    return [];
  }

  return (data || []).map(dbToApp);
}

// Save a new reply
export async function saveReply(
  annotationId: string,
  content: string,
  isAnonymous: boolean = false,
  parentReplyId?: string
): Promise<Reply | null> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('User not authenticated');
    return null;
  }

  // Try to insert with is_anonymous field
  let insertData: any = {
    annotation_id: annotationId,
    user_id: user.id,
    content: content,
  };

  // Only add is_anonymous if the column exists (user has run migration)
  // We'll try with it first, then without if it fails
  insertData.is_anonymous = isAnonymous;

  // Add parent_reply_id if this is a nested reply
  if (parentReplyId) {
    insertData.parent_reply_id = parentReplyId;
  }

  let { data, error } = await supabase
    .from('replies')
    .insert(insertData)
    .select()
    .single();

  // If is_anonymous column doesn't exist, try without it
  if (error && error.message?.includes('is_anonymous')) {
    console.warn('is_anonymous column not found. Run supabase-add-anonymous-field.sql to enable anonymous replies.');
    delete insertData.is_anonymous;

    const result = await supabase
      .from('replies')
      .insert(insertData)
      .select()
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error('Error saving reply:', error);
    return null;
  }

  return dbToApp(data);
}

// Delete a reply
export async function deleteReply(replyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('replies')
    .delete()
    .eq('id', replyId);

  if (error) {
    console.error('Error deleting reply:', error);
    return false;
  }

  return true;
}
