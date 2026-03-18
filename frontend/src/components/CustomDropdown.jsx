import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CustomDropdown = ({ label, options, value, onChange }) => {
  const [isOpen, setIsOpen]   = useState(false);
  const [coords, setCoords]   = useState({ top: 0, left: 0, width: 0 });
  const buttonRef             = useRef(null);
  const selectedOption        = options.find(opt => opt.value === value) || options[0];

  const open = () => {
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({
      top:   rect.bottom + 6,   // fixed = relativo al viewport, sin scrollY
      left:  rect.left,
      width: rect.width,
    });
    setIsOpen(true);
  };

  // Cerrar si el usuario hace scroll o resize
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg/20 ml-1">{label}</span>
      <button
        ref={buttonRef}
        onClick={() => isOpen ? setIsOpen(false) : open()}
        className="flex items-center justify-between bg-fg/5 border border-fg/10 rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-tight hover:bg-fg/10 transition-all outline-none focus:border-accent-orange/50"
      >
        <span className={value ? 'text-fg' : 'text-fg/40'}>{selectedOption.label}</span>
        <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop invisible para cerrar al clickear afuera */}
              <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{ top: coords.top, left: coords.left, width: coords.width }}
                className="fixed z-[1000] bg-bg border border-fg/10 rounded-2xl overflow-hidden shadow-2xl"
              >
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { onChange(opt.value); setIsOpen(false); }}
                    className={`w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors hover:bg-fg/5 ${
                      value === opt.value ? 'text-accent-orange bg-fg/5' : 'text-fg/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default CustomDropdown;
