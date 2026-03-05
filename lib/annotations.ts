import { supabase } from './supabase';

export interface Annotation {
  id: string;
  pageNumber: number;
  type: "highlight" | "pen" | "text";
  data: any;
  comment?: string;
  color?: string;
  visibility?: 'private' | 'public';
  userId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface DBAnnotation {
  id: string;
  user_id: string;
  book_id: string;
  page_number: number;
  type: string;
  data: any;
  comment: string | null;
  color: string | null;
  visibility?: string;
  created_at: string;
  updated_at: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
}

// Convert DB annotation to app annotation
function dbToApp(dbAnnotation: DBAnnotation): Annotation {
  return {
    id: dbAnnotation.id,
    pageNumber: dbAnnotation.page_number,
    type: dbAnnotation.type as "highlight" | "pen" | "text",
    data: dbAnnotation.data,
    comment: dbAnnotation.comment || undefined,
    color: dbAnnotation.color || undefined,
    visibility: (dbAnnotation.visibility || 'private') as 'private' | 'public',
    userId: dbAnnotation.user_id,
    username: dbAnnotation.username,
    displayName: dbAnnotation.display_name,
    avatarUrl: dbAnnotation.avatar_url,
  };
}

// Load annotations for a specific book (includes public annotations from other users)
export async function loadAnnotations(bookId: string): Promise<Annotation[]> {
  // Try to use the view with user info first
  let { data, error } = await supabase
    .from('annotations_with_users')
    .select('*')
    .eq('book_id', bookId)
    .order('created_at', { ascending: true });

  // If view doesn't exist, fall back to regular table
  if (error) {
    console.warn('annotations_with_users view not found, falling back to annotations table. Run supabase-shared-annotations.sql to enable shared annotations.');
    const result = await supabase
      .from('annotations')
      .select('*')
      .eq('book_id', bookId)
      .order('created_at', { ascending: true });

    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error('Error loading annotations. Make sure you have run supabase-setup.sql in your Supabase dashboard to create the annotations table.', error);
    return [];
  }

  return (data || []).map(dbToApp);
}

// Save a new annotation
export async function saveAnnotation(
  bookId: string,
  annotation: Omit<Annotation, 'id' | 'userId' | 'username' | 'displayName' | 'avatarUrl'>
): Promise<Annotation | null> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('User not authenticated');
    return null;
  }

  // Try to insert with visibility field
  let insertData: any = {
    user_id: user.id,
    book_id: bookId,
    page_number: annotation.pageNumber,
    type: annotation.type,
    data: annotation.data,
    comment: annotation.comment || null,
    color: annotation.color || null,
  };

  // Only add visibility if the column exists (user has run migration)
  // We'll try with it first, then without if it fails
  insertData.visibility = annotation.visibility || 'public';

  let { data, error } = await supabase
    .from('annotations')
    .insert(insertData)
    .select()
    .single();

  // If visibility column doesn't exist, try without it
  if (error && error.message?.includes('visibility')) {
    console.warn('visibility column not found. Run supabase-shared-annotations.sql to enable public/private annotations.');
    delete insertData.visibility;

    const result = await supabase
      .from('annotations')
      .insert(insertData)
      .select()
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error('Error saving annotation:', error);
    return null;
  }

  return dbToApp(data);
}

// Delete an annotation
export async function deleteAnnotation(annotationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('annotations')
    .delete()
    .eq('id', annotationId);

  if (error) {
    console.error('Error deleting annotation:', error);
    return false;
  }

  return true;
}

// Delete multiple annotations (e.g., clear page)
export async function deleteAnnotations(annotationIds: string[]): Promise<boolean> {
  const { error } = await supabase
    .from('annotations')
    .delete()
    .in('id', annotationIds);

  if (error) {
    console.error('Error deleting annotations:', error);
    return false;
  }

  return true;
}

// Update an annotation
export async function updateAnnotation(
  annotationId: string,
  updates: Partial<Omit<Annotation, 'id'>>
): Promise<Annotation | null> {
  const dbUpdates: any = {};

  if (updates.pageNumber !== undefined) dbUpdates.page_number = updates.pageNumber;
  if (updates.type !== undefined) dbUpdates.type = updates.type;
  if (updates.data !== undefined) dbUpdates.data = updates.data;
  if (updates.comment !== undefined) dbUpdates.comment = updates.comment || null;
  if (updates.color !== undefined) dbUpdates.color = updates.color || null;

  const { data, error } = await supabase
    .from('annotations')
    .update(dbUpdates)
    .eq('id', annotationId)
    .select()
    .single();

  if (error) {
    console.error('Error updating annotation:', error);
    return null;
  }

  return dbToApp(data);
}
