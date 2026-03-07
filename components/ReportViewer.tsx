"use client";

import { useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { IconSearch, IconX } from "@tabler/icons-react";

import type { FailedGameEntry } from "@/types/report";

interface ReportViewerProps {
  date: string | null;
  isOpen: boolean;
  isLoading: boolean;
  entries: FailedGameEntry[];
  onClose: () => void;
}

export default function ReportViewer({ date, isOpen, isLoading, entries, onClose }: ReportViewerProps) {
  const [search, setSearch] = useState("");

  const filteredEntries = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    if (!searchValue) {
      return entries;
    }

    return entries.filter((entry) => {
      return (
        entry.url.toLowerCase().includes(searchValue) || entry.reason.toLowerCase().includes(searchValue)
      );
    });
  }, [entries, search]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="report-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Failed URLs</h3>
                <p className="text-sm text-zinc-400">{date ?? "No date selected"}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-700 p-2 text-zinc-300 transition hover:border-zinc-500"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="mb-4">
              <label className="relative block">
                <IconSearch size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                  }}
                  placeholder="Search URL or reason"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pr-3 pl-10 text-sm text-zinc-100 outline-none transition focus:border-amber-300"
                />
              </label>
            </div>

            <div className="max-h-96 overflow-y-auto rounded-lg border border-zinc-800">
              {isLoading ? (
                <p className="p-4 text-sm text-zinc-400">Loading report...</p>
              ) : filteredEntries.length === 0 ? (
                <p className="p-4 text-sm text-zinc-400">No failed URLs found for this filter.</p>
              ) : (
                <ul className="divide-y divide-zinc-900">
                  {filteredEntries.map((entry) => (
                    <li key={`${entry.url}-${entry.timestamp}`} className="p-3">
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-xs text-blue-300 underline-offset-2 hover:underline"
                      >
                        {entry.url}
                      </a>
                      <p className="mt-1 text-xs text-red-300">{entry.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
