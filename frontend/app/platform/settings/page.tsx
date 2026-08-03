"use client";

import React, { useEffect, useState } from "react";

interface PlatformOperatorUser {
  full_name: string;
  username: string;
  email: string;
  role: string;
}

export default function PlatformSettingsPage() {
  const [user, setUser] = useState<PlatformOperatorUser | null>(null);

  useEffect(() => {
    fetch("/api/platform/auth/me")
      .then((res) => res.json())
      .then((data: { user?: PlatformOperatorUser }) => setUser(data.user || null))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-2">
        <h1 className="text-lg font-bold text-slate-100">Platform Operator Profile & Security</h1>
        <p className="text-xs text-slate-400">
          Viewing active platform credentials and privileged session authority
        </p>
      </div>

      {user && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 text-xs">
          <div className="flex justify-between items-center pb-3 border-b border-slate-800">
            <span className="text-slate-400">Operator Full Name:</span>
            <span className="font-bold text-slate-100">{user.full_name}</span>
          </div>

          <div className="flex justify-between items-center pb-3 border-b border-slate-800">
            <span className="text-slate-400">Operator Username:</span>
            <span className="font-mono text-slate-200">{user.username}</span>
          </div>

          <div className="flex justify-between items-center pb-3 border-b border-slate-800">
            <span className="text-slate-400">Email Address:</span>
            <span className="font-mono text-slate-200">{user.email}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-400">Platform Role:</span>
            <span className="px-2.5 py-1 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono font-bold">
              {user.role}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
