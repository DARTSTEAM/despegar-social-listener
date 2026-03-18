const Modal = ({ modal, closeModal }) => {
  if (!modal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={closeModal}
    >
      <div
        className="pwa-card p-8 max-w-md w-full mx-4 space-y-6 border border-fg/10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-y-2">
          <h2 className="text-sm font-black uppercase italic tracking-widest text-fg">{modal.title}</h2>
          <p className="text-xs text-fg/60 leading-relaxed">{modal.message}</p>
        </div>
        <div className="flex gap-3 justify-end">
          {modal.type === 'confirm' && (
            <button
              onClick={closeModal}
              className="px-5 py-2 text-[10px] font-black uppercase italic bg-fg/5 border border-fg/10 rounded-full hover:bg-fg/10 transition-all text-fg/60"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={() => { if (modal.onConfirm) modal.onConfirm(); closeModal(); }}
            className="px-5 py-2 text-[10px] font-black uppercase italic bg-accent-lemon text-black rounded-full hover:scale-105 transition-all shadow-[0_0_20px_rgba(152,255,188,0.2)]"
          >
            {modal.type === 'confirm' ? 'Confirmar' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;
