"use client";

import { useState } from "react";
import type { LocaleStrings } from "@/lib/locale";

export interface BrowseStep {
  action: string;
  intent: string;
  url: string;
}

export interface BrowseActivity {
  id: string;
  operation: string;
  status: "running" | "done" | "failed";
  title: string;
  url: string;
  step: number;
  lastIntent: string;
  summary: string;
  previewUrl: string;
  steps: BrowseStep[];
}

interface BrowserActivityProps {
  activity: BrowseActivity;
  strings: LocaleStrings["chat"];
}

function hostOf(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function StatusDot({ status }: { status: BrowseActivity["status"] }) {
  const color =
    status === "running" ? "bg-emerald-500 animate-pulse" : status === "done" ? "bg-[#0a2240]" : "bg-amber-500";
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

function GlobeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </svg>
  );
}

/**
 * Live view of the automated browser: a compact card in the chat that opens a
 * large viewer with the latest screenshot and the step log.
 */
export default function BrowserActivity({ activity, strings }: BrowserActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const browseStrings = strings.browse;
  const statusLabel =
    activity.status === "running"
      ? browseStrings.running
      : activity.status === "done"
        ? browseStrings.finished
        : browseStrings.stopped;
  const caption = activity.lastIntent || activity.summary || browseStrings.opening;

  return (
    <>
      <div className="flex items-start gap-3 w-full mt-2">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full text-white shadow-sm"
          style={{ width: 26, height: 26, background: "#0a2240" }}
        >
          <GlobeIcon size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="block w-full text-left rounded-xl overflow-hidden bg-white shadow-sm transition-shadow hover:shadow-md"
            style={{ border: "1px solid #e6ebf2" }}
          >
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid #f1f5f9" }}>
              <StatusDot status={activity.status} />
              <span className="flex-1 min-w-0 truncate text-[12px] font-semibold text-[#0a2240]">
                {activity.title || browseStrings.title}
              </span>
              <span className="flex-shrink-0 text-[10px] font-medium text-gray-400">
                {browseStrings.step(Math.max(activity.step, 0))}
              </span>
            </div>

            {activity.previewUrl ? (
              <img
                src={activity.previewUrl}
                alt=""
                className="w-full bg-[#f8f9fa]"
                style={{ maxHeight: 140, objectFit: "cover", objectPosition: "top" }}
              />
            ) : (
              <div className="flex items-center justify-center bg-[#f8f9fa] h-[110px] text-[11px] text-gray-400">
                {browseStrings.opening}
              </div>
            )}

            <div className="px-3 py-2">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400">
                <span className="truncate">{hostOf(activity.url) || browseStrings.noPage}</span>
                <span>•</span>
                <span className="flex-shrink-0">{statusLabel}</span>
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-[#1e293b] truncate">{caption}</p>
            </div>
          </button>
          <p className="mt-1.5 ml-1 text-[11px] font-medium text-gray-400">{browseStrings.tapToExpand}</p>
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-6 backdrop-blur-sm"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid #e6ebf2" }}>
              <StatusDot status={activity.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-[#0a2240]">
                  {activity.title || browseStrings.title}
                </p>
                <p className="truncate text-[11px] text-gray-400">{activity.url || browseStrings.noPage}</p>
              </div>
              <span className="flex-shrink-0 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11px] font-semibold text-[#0a2240]">
                {browseStrings.step(activity.step)} · {statusLabel}
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex-shrink-0 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
                aria-label={browseStrings.close}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
              <div className="flex min-h-0 flex-1 items-center justify-center bg-[#0f172a] p-3">
                {activity.previewUrl ? (
                  <img
                    src={activity.previewUrl}
                    alt=""
                    className="max-h-[64vh] w-full rounded-lg object-contain"
                  />
                ) : (
                  <p className="py-16 text-[12px] text-slate-300">{browseStrings.opening}</p>
                )}
              </div>

              <aside
                className="flex max-h-[32vh] w-full flex-col overflow-y-auto px-4 py-3 md:max-h-none md:w-[290px]"
                style={{ borderLeft: "1px solid #f1f5f9" }}
              >
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  {browseStrings.task}
                </p>
                <p className="mb-3 text-[12px] leading-snug text-[#1e293b]">{activity.summary || caption}</p>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  {browseStrings.steps}
                </p>
                <ol className="space-y-1.5">
                  {activity.steps.slice(-14).map((item, index) => (
                    <li key={`${item.action}-${index}`} className="flex gap-2 text-[11px] leading-snug">
                      <span className="w-3 flex-shrink-0 text-right font-semibold text-gray-300">
                        {Math.max(activity.steps.length - 14, 0) + index + 1}
                      </span>
                      <span className="min-w-0 text-gray-600">{item.intent || item.action}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
