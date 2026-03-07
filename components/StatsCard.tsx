"use client";

import { motion } from "framer-motion";
import type { ComponentType } from "react";

type IconComponent = ComponentType<{ className?: string; size?: number; stroke?: number }>;

interface StatsCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: IconComponent;
}

export default function StatsCard({ title, value, description, icon: Icon }: StatsCardProps) {
  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
      className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5 shadow-xl shadow-black/20 backdrop-blur"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-400">{title}</h3>
        <Icon className="text-amber-300" size={20} stroke={1.8} />
      </div>
      <p className="text-3xl font-semibold text-zinc-100">{value}</p>
      <p className="mt-2 text-sm text-zinc-400">{description}</p>
    </motion.article>
  );
}
