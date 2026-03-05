"use client";

interface ThreadCardProps {
  author: string;
  time: string;
  title: string;
  preview: string;
  replies: number;
  likes: number;
}

export default function ThreadCard({ author, time, title, preview, replies, likes }: ThreadCardProps) {
  return (
    <div className="group cursor-pointer rounded-xl border border-gray-300 bg-white p-6 transition-all hover:border-gray-400 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500" />
            <div>
              <p className="text-sm font-medium text-gray-900" style={{ fontFamily: "'Crimson Text', serif" }}>{author}</p>
              <p className="text-xs text-gray-500" style={{ fontFamily: "'Crimson Text', serif" }}>{time}</p>
            </div>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900 group-hover:text-blue-600" style={{ fontFamily: "'Crimson Text', serif" }}>
            {title}
          </h3>
          <p className="text-sm text-gray-600 line-clamp-2" style={{ fontFamily: "'Crimson Text', serif" }}>{preview}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 text-sm text-gray-500" style={{ fontFamily: "'Crimson Text', serif" }}>
        <span className="flex items-center gap-1">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {replies} replies
        </span>
        <span className="flex items-center gap-1">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {likes}
        </span>
      </div>
    </div>
  );
}
