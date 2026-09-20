import { motion } from "framer-motion";

/** Animated backdrop: grid + radial glows + floating orbs + vignette. */
export function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="bg-grid absolute inset-0 animate-gridmove opacity-70" />
      <div className="bg-radial-fade absolute inset-0" />
      {/* floating orbs */}
      <motion.div
        className="absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl"
        animate={{ y: [0, -30, 0], x: [0, 25, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-32 top-10 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl"
        animate={{ y: [0, 35, 0], x: [0, -20, 0] }}
        transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-lime-500/5 blur-3xl"
        animate={{ y: [0, -25, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* scan line sweep */}
      <motion.div
        className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent"
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#04050b]" />
    </div>
  );
}