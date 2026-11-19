'use client';

import React from 'react';

interface PlatformLogoProps {
  platformId: string;
  size?: number;
  className?: string;
}

export function PlatformLogo({ platformId, size = 40, className = '' }: PlatformLogoProps) {
  const p = (platformId || '').toUpperCase();
  const s = `${size}px`;

  // 1. NOTAZZ (4 diamantes coloridos: ciano topo, laranja direita, marinho base, azul esquerda)
  if (p === 'NOTAZZ') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#10141e] border border-zinc-700/60 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <polygon points="12,2 16.5,6.5 12,11 7.5,6.5" fill="#00C9FF" />
          <polygon points="17.5,7.5 22,12 17.5,16.5 13,12" fill="#FFA500" />
          <polygon points="6.5,7.5 11,12 6.5,16.5 2,12" fill="#0072CE" />
          <polygon points="12,13 16.5,17.5 12,22 7.5,17.5" fill="#0A3663" />
        </svg>
      </div>
    );
  }

  // 2. ONPROFIT (Símbolo geométrico verde menta OP entrelaçado)
  if (p === 'ONPROFIT') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#11161d] border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 15L9 9L13 15H9.5L8 17L5 15Z"
            fill="#00E599"
          />
          <path
            d="M19 9L15 15L11 9H14.5L16 7L19 9Z"
            fill="#00E599"
          />
          <circle cx="12" cy="12" r="2" fill="#00E599" />
        </svg>
      </div>
    );
  }

  // 3. PAGAR.ME (Círculo verde vivo com arco concêntrico e ponto)
  if (p === 'PAGARME') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#48B324] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.8" strokeDasharray="42 16" />
          <circle cx="12" cy="12" r="3.2" fill="white" />
        </svg>
      </div>
    );
  }

  // 4. PAYT (Laranja com tipografia payt cursiva branca)
  if (p === 'PAYT') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#FF5B00] border border-[#ff7326] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="16" stroke="white" strokeWidth="1.2" strokeOpacity="0.4" />
          <text
            x="18"
            y="23"
            textAnchor="middle"
            fill="white"
            fontSize="13"
            fontWeight="900"
            fontFamily="sans-serif"
            fontStyle="italic"
            letterSpacing="-0.5px"
          >
            payt
          </text>
        </svg>
      </div>
    );
  }

  // 5. PAYT CUSTOM (Branco com borda e tipografia laranja payt)
  if (p === 'PAYT_CUSTOM') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-white border border-[#FF5B00] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="16" stroke="#FF5B00" strokeWidth="1.2" strokeOpacity="0.5" />
          <text
            x="18"
            y="23"
            textAnchor="middle"
            fill="#FF5B00"
            fontSize="13"
            fontWeight="900"
            fontFamily="sans-serif"
            fontStyle="italic"
            letterSpacing="-0.5px"
          >
            payt
          </text>
        </svg>
      </div>
    );
  }

  // 6. PEPPER (Círculo vermelho com chama/pimenta branca estilizada)
  if (p === 'PEPPER') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#E51E2B] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2C8.5 6 6 9.5 6 13.5C6 17.5 9 21 12.5 21C16.5 21 19 17.5 19 13.5C19 9 16 5 12 2ZM12.5 18C10.5 18 9 16.5 9 14.5C9 12 11 9.5 12.5 8C14 9.5 15.5 12 15.5 14.5C15.5 16.5 14.5 18 12.5 18Z"
            fill="white"
          />
        </svg>
      </div>
    );
  }

  // 7. PERFECT PAY (Logo oficial Perfect Pay - Fundo verde-petróleo com P geométrico e seta)
  if (p === 'PERFECTPAY') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#00a896] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/perfectpay.png"
          alt="Perfect Pay"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 8. PROLUNO (Fundo escuro com círculo branco e P azul-petróleo)
  if (p === 'PROLUNO') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#181a20] border border-zinc-700 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <div className="w-[72%] h-[72%] rounded-full bg-white flex items-center justify-center">
          <span className="text-[#10141e] font-black text-sm tracking-tighter">P</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00C9FF] ml-0.5 mt-2"></span>
        </div>
      </div>
    );
  }

  // 9. RD STATION (Ciano com as duas setas horizontais da RD)
  if (p === 'RD_STATION') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#00A4B8] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
          <path
            d="M4 8.5H16L13 5.5M20 15.5H8L11 18.5"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  // 10. SACOLEIROAPP (Vermelho com a sacola/mascote sorridente branco)
  if (p === 'SACOLEIROAPP') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#D32F2F] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
          <path
            d="M8 8V6C8 4.34315 9.34315 3 11 3H13C14.6569 3 16 4.34315 16 6V8"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="4" y="8" width="16" height="13" rx="3" fill="white" />
          <circle cx="9" cy="13" r="1.2" fill="#D32F2F" />
          <circle cx="15" cy="13" r="1.2" fill="#D32F2F" />
          <path
            d="M9 16C10 17.5 14 17.5 15 16"
            stroke="#D32F2F"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // 11. SELLFLUX (Logo oficial SellFlux - Quadrados ciano e roxo com seta branca)
  if (p === 'SELLFLUX') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/sellflux.webp"
          alt="SellFlux"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 12. SHOPIFY (Sacola verde oficial Shopify com 'S' e folha)
  if (p === 'SHOPIFY') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#95BF47] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <path
            d="M17.5 5.5L16 4.5C15 3.5 13.5 4 12.5 4.5C12 4.7 11.5 5 11 5.5L6.5 7L4.5 21H19.5L17.5 5.5Z"
            fill="white"
          />
          <path
            d="M13 10.5C11 10 10.5 11 10.5 11.8C10.5 13 13.5 13.5 13.5 15C13.5 16 12 16.5 11 16C10 15.5 9.5 14.8 9.5 14.8L8.5 16.2C8.5 16.2 9.5 17.5 11.2 17.5C13 17.5 15 16.5 15 14.8C15 13.2 12 12.8 12 11.8C12 11 13 10.8 13.5 11.2C14 11.5 14.2 12 14.2 12L15.5 11C15.5 11 14.5 10 13 10.5Z"
            fill="#95BF47"
          />
        </svg>
      </div>
    );
  }

  // 13. TICTO & TICTO V2 (Logo oficial Ticto com T branco e entalhe angular)
  if (p.includes('TICTO')) {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-black flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/ticto.png"
          alt="Ticto"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 14. UNBOUNCE (Azul com círculo aberto e corte diagonal)
  if (p === 'UNBOUNCE') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#0066FF] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2.6" />
          <line x1="7" y1="7" x2="17" y2="17" stroke="#0066FF" strokeWidth="3" />
        </svg>
      </div>
    );
  }

  // 15. VNDA (Azul escuro com 'V' geométrico em branco)
  if (p === 'VNDA') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#00249C] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white font-black text-base tracking-tighter italic">V</span>
      </div>
    );
  }

  // 16. VOOMP (Marinho com 'V' duplo estilizado em laranja/dourado)
  if (p === 'VOOMP') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#0F1E36] border border-blue-900/60 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 6C7 11 9 17 12 19C15 17 17 11 19 6C16 11 14 15 12 15C10 15 8 11 5 6Z"
            fill="#FF8C00"
          />
        </svg>
      </div>
    );
  }

  // 17. WBUY (Vermelho com 'W' arredondado branco)
  if (p === 'WBUY') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#E51937] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <path
            d="M4 7L7.5 17L10.5 9L13.5 17L17 7"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  // 18. WIX (Amarelo vibrante com mascote/logo Wix)
  if (p === 'WIX') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#F5B700] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 28 28" fill="none">
          <circle cx="8" cy="8" r="4" fill="white" />
          <circle cx="20" cy="8" r="4" fill="white" />
          <circle cx="14" cy="15" r="9" fill="white" />
          <circle cx="11.5" cy="14" r="1.5" fill="#181a20" />
          <circle cx="16.5" cy="14" r="1.5" fill="#181a20" />
          <path d="M12 17.5C13 18.5 15 18.5 16 17.5" stroke="#181a20" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 19. WOOCOMMERCE (Roxo oficial com balão branco Woo)
  if (p.includes('WOOCOMMERCE')) {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#7F54B3] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <div className="px-1.5 py-0.5 rounded-md bg-white flex items-center justify-center">
          <span className="text-[#7F54B3] font-black text-[10px] tracking-tighter">Woo</span>
        </div>
      </div>
    );
  }

  // 20. WORDPRESS (Logo oficial WordPress)
  if (p === 'WORDPRESS') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#21759B] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/wordpress.avif"
          alt="WordPress"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 21. FORMULÁRIOS (Fundo amarelo ouro com documento roxo e linhas)
  if (p.includes('FORM') || p === 'FORMULARIO') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#F59E0B] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <div className="w-[58%] h-[68%] rounded-sm bg-[#7C3AED] shadow-sm flex flex-col justify-center px-1 gap-1">
          <div className="w-full h-0.5 bg-white/90 rounded-full"></div>
          <div className="w-3/4 h-0.5 bg-white/70 rounded-full"></div>
          <div className="w-1/2 h-0.5 bg-white/50 rounded-full"></div>
        </div>
      </div>
    );
  }

  // 22. GREENN (Verde escuro com pin/balão esmeralda e checkmark branco)
  if (p === 'GREENN') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#08241B] border border-emerald-500/40 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill="#00D586" />
          <path
            d="M8.5 12.5L11 15L15.5 9.5"
            stroke="#08241B"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  // 23. HEROSPARK (Magenta com 'H' estilizado branco)
  if (p === 'HEROSPARK') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#FF0055] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <path
            d="M6 5V19M18 5V19M6 12H18"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // 24. HOTMART & HOTMART V2 (Logo oficial Hotmart - Fundo laranja vibrante com a chama branca e centro laranja)
  if (p === 'HOTMART' || p === 'HOTMART_V2') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#FF4500] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/hotmart.png"
          alt="Hotmart"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 25. HOTWEBINAR (Vermelho com 'H' centralizado)
  if (p === 'HOTWEBINAR') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#E53935] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white font-black text-base">H</span>
      </div>
    );
  }

  // 26. IRROBA (Fundo escuro com círculo branco e 'i' em espiral vermelho)
  if (p === 'IRROBA') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#181a20] border border-zinc-700 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <div className="w-[72%] h-[72%] rounded-full bg-white flex items-center justify-center">
          <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="#E52E2E" strokeWidth="2" strokeDasharray="16 6" />
            <circle cx="10" cy="7" r="1.5" fill="#E52E2E" />
            <path d="M10 10V14" stroke="#E52E2E" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    );
  }

  // 27. ISET & ISET CUSTOM (Azul com anel branco e 'i' estilizado)
  if (p.includes('ISET')) {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#0B4F8C] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8" />
          <circle cx="12" cy="7.5" r="1.5" fill="white" />
          <path d="M12 11V16" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 28. KIRVANO (Preto com 'K' branco moderno serifado)
  if (p === 'KIRVANO') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-black border border-zinc-700 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white font-serif font-black text-base">K</span>
      </div>
    );
  }

  // 29. KIWIFY (Logo oficial Kiwify - Fundo verde com fatia de kiwi branca)
  if (p === 'KIWIFY') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#10b981] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/kiwify.webp"
          alt="Kiwify"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 30. LASTLINK (Verde com 3 nós conectados em triângulo)
  if (p === 'LASTLINK') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#181a20] border border-zinc-700 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <div className="w-[72%] h-[72%] rounded-full bg-white flex items-center justify-center">
          <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 20 20" fill="none">
            <line x1="6" y1="14" x2="14" y2="14" stroke="#00A868" strokeWidth="2" />
            <line x1="6" y1="14" x2="10" y2="6" stroke="#00A868" strokeWidth="2" />
            <line x1="14" y1="14" x2="10" y2="6" stroke="#00A868" strokeWidth="2" />
            <circle cx="10" cy="6" r="2.5" fill="#00A868" />
            <circle cx="6" cy="14" r="2.5" fill="#00A868" />
            <circle cx="14" cy="14" r="2.5" fill="#00A868" />
          </svg>
        </div>
      </div>
    );
  }

  // 31. LEADSTER (Azul claro com asterisco/estrela de 6 pontas branca)
  if (p === 'LEADSTER') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#38BDF8] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3V21M3 12H21M5.6 5.6L18.4 18.4M5.6 18.4L18.4 5.6"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // 32. MAGENTO (Laranja com o 'M' arquitetônico oficial)
  if (p === 'MAGENTO') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#EE672F] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3L4 7.5V16.5L7 18.2V9.2L12 6.4L17 9.2V18.2L20 16.5V7.5L12 3Z"
            fill="white"
          />
          <polygon points="12,11.5 9.5,13 9.5,21 12,19.5 14.5,21 14.5,13" fill="white" />
        </svg>
      </div>
    );
  }

  // 33. MANYCHAT (Preto com dois balões de fala 'M' sobrepostos)
  if (p === 'MANYCHAT') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-black border border-zinc-700 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <div className="w-[72%] h-[72%] rounded-full bg-white flex items-center justify-center">
          <span className="text-black font-black text-sm tracking-tighter">m</span>
        </div>
      </div>
    );
  }

  // 34. MELLDIN (Escuro com o personagem de turbante)
  if (p === 'MELLDIN') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#181a20] border border-zinc-700 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <div className="w-[72%] h-[72%] rounded-full bg-pink-100 flex items-center justify-center overflow-hidden">
          <span className="text-[#FF007A] font-black text-xs">👳</span>
        </div>
      </div>
    );
  }

  // 35. MONETIZZE (Logo oficial Monetizze - Azul com emblema $ branco em loop)
  if (p === 'MONETIZZE') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#0050ff] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/monetizze.webp"
          alt="Monetizze"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 36. ABMEX (Preto com X estilizado laranja)
  if (p === 'ABMEX') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#121316] border border-zinc-700 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-orange-500 font-black text-base">✕</span>
      </div>
    );
  }

  // 37. ACTIVE CAMPAIGN (Azul royal com seta dupla)
  if (p === 'ACTIVE_CAMPAIGN') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#004CFF] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white font-black text-xl leading-none">›</span>
      </div>
    );
  }

  // 38. APPMAX (Verde menta com seta angular)
  if (p === 'APPMAX') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#0E1A14] border border-[#00D084]/40 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-[#00D084] font-black text-base">⮑</span>
      </div>
    );
  }

  // 39. ASAAS (Logo oficial Asaas - Fundo azul royal com o wordmark ASAAS em branco)
  if (p === 'ASAAS') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#0047FF] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/asaas.webp"
          alt="Asaas"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 40. B4YOU (Verde-azulado com '4+')
  if (p === 'B4YOU') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#002B2B] border border-teal-500/40 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-teal-400 font-black text-xs">4+</span>
      </div>
    );
  }

  // 41. BRAIP & BRAIP STATUS ENTREGUE (Logo oficial Braip - Fundo roxo com tipografia oficial)
  if (p.includes('BRAIP')) {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#6C2BD9] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/braip.jpg"
          alt="Braip"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 42. DIGITAL GURU (Verde menta com GURU)
  if (p === 'DIGITAL_GURU') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#D1FAE5] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-emerald-900 font-extrabold text-[9px] tracking-tight">GURU</span>
      </div>
    );
  }

  // 43. DOPPUS (Logo oficial Doppus - Laranja com d branco)
  if (p.includes('DOPPUS')) {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#FF5B00] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/doppus.png"
          alt="Doppus"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 44. EDUZZ (Logo oficial Eduzz - Azul marinho com moeda/sol dourado)
  if (p === 'EDUZZ') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-[#0B1B3D] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/eduzz.png"
          alt="Eduzz"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 45. FACEBOOK (Azul Facebook com 'f' branco)
  if (p === 'FACEBOOK') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#1877F2] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white font-black text-base">f</span>
      </div>
    );
  }

  // 46. YAMPI & YAMPI CARRINHO ABANDONADO (Branco com borda roxa e 'yampi')
  if (p.includes('YAMPI')) {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-white border border-purple-400 flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-[#7928CA] font-bold text-[9px]">yampi</span>
      </div>
    );
  }

  // 47. CAKTO (Logo oficial Cakto - Fundo verde com o cacto branco característico)
  if (p === 'CAKTO') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full overflow-hidden bg-gradient-to-b from-[#48a065] to-[#2e7d32] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <img
          src="/uploads/cakto.webp"
          alt="Cakto"
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      </div>
    );
  }

  // 48. ENSINIO (Azul escuro com cap de formatura)
  if (p.includes('ENSINIO')) {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#3B82F6] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white text-xs">🎓</span>
      </div>
    );
  }

  // 49. ASSINY (Azul marinho com pena/assinatura)
  if (p === 'ASSINY') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#1E3A8A] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white text-xs">✍️</span>
      </div>
    );
  }

  // 50. TMB VENDAS (Laranja com etiqueta de venda)
  if (p === 'TMB_VENDAS') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#F97316] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white font-black text-[10px]">TMB</span>
      </div>
    );
  }

  // 51. WORKCASH (Verde com cifrão)
  if (p === 'WORKCASH') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-[#16A34A] flex items-center justify-center shrink-0 shadow-xs ${className}`}
      >
        <span className="text-white font-black text-xs">$</span>
      </div>
    );
  }

  // 52. DADOS DOS LEADS (Azul com usuários)
  if (p === 'DADOS_DOS_LEADS' || p === 'LEAD_DATA') {
    return (
      <div
        style={{ width: s, height: s }}
        className={`rounded-full bg-blue-600/30 border border-blue-400/50 flex items-center justify-center text-blue-400 shrink-0 shadow-xs ${className}`}
      >
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
          <path
            d="M17 21V19C17 16.7909 15.2091 15 13 15H5C2.79086 15 1 16.7909 1 19V21M9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7C13 9.20914 11.2091 11 9 11ZM23 21V19C22.9986 17.1771 21.765 15.5857 20 15.13M16 3.13C17.7699 3.58317 19.0078 5.17799 19.0078 7.005C19.0078 8.83201 17.7699 10.4268 16 10.88"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  // Padrão / Fallback elegante para qualquer outra plataforma
  return (
    <div
      style={{ width: s, height: s }}
      className={`rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xs shrink-0 shadow-xs ${className}`}
    >
      {p.replace(/[^A-Z0-9]/g, '').substring(0, 2) || 'PL'}
    </div>
  );
}
