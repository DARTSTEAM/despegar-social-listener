const BrandLogo = ({ onNavigate }) => (
  <div className="flex flex-col mb-10 group cursor-pointer" onClick={() => onNavigate('home')}>
    <div className="h-28 w-full mb-6 overflow-hidden rounded-3xl bg-fg/5 backdrop-blur-xl border border-fg/10 p-4 flex items-center justify-center transition-all group-hover:bg-fg/10 shadow-2xl relative">
      <div className="absolute inset-0 bg-accent-orange/5 opacity-0 group-hover:opacity-100 transition-opacity blur-2xl" />
      <img
        src="https://companieslogo.com/img/orig/DESP_BIG.D-a29edc57.png?t=1742715926"
        alt="Despegar Logo"
        className="h-full w-auto object-contain brightness-0 invert relative z-10 transition-transform group-hover:scale-105 duration-500"
      />
    </div>
    <div className="flex flex-col px-1">
      <span className="font-black italic text-2xl tracking-tighter uppercase leading-none text-fg/90 group-hover:text-accent-orange transition-colors">Despegar</span>
      <span className="font-black italic text-4xl tracking-tighter uppercase leading-none text-accent-orange">Listener</span>
    </div>
  </div>
);

export default BrandLogo;
