"use client";

import { motion } from "framer-motion";
import { IconPlayerPlay, IconLoader2 } from "@tabler/icons-react";

interface RunMonitorButtonProps {
  isRunning: boolean;
  onRun: () => Promise<void>;
}

export default function RunMonitorButton({ isRunning, onRun }: RunMonitorButtonProps) {
  return (
    <motion.button
      type="button"
      whileHover={isRunning ? undefined : { scale: 1.02 }}
      whileTap={isRunning ? undefined : { scale: 0.98 }}
      onClick={() => {
        void onRun();
      }}
      disabled={isRunning}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-amber-300/25 transition disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300 sm:w-auto"
    >
      {isRunning ? <IconLoader2 className="animate-spin" size={18} /> : <IconPlayerPlay size={18} />}
      {isRunning ? "Monitoring in Progress" : "Run Monitor"}
    </motion.button>
  );
}
