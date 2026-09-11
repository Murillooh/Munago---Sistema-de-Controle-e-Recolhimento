import React from 'react';
import { motion } from 'motion/react';

export const PreloadView = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07070a]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="flex flex-col items-center"
      >
        <div className="relative w-24 h-24 mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-full h-full border-4 border-t-[#3b82f6] border-r-[#3b82f6] border-b-transparent border-l-transparent rounded-full"
          />
        </div>
        <h1 className="text-2xl font-black text-white tracking-widest uppercase">Munago</h1>
        <p className="text-[10px] font-bold text-[#918f9a] mt-2 tracking-[0.2em] uppercase">Carregando sistema...</p>
      </motion.div>
    </div>
  );
};
