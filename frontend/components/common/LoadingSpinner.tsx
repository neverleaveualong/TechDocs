"use client";

export default function LoadingSpinner({ message = "로딩 중..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
