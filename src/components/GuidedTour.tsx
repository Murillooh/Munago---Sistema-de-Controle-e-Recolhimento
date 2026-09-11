import React, { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface GuidedTourProps {
  runTrigger?: number;
}

export const GuidedTour: React.FC<GuidedTourProps> = ({ runTrigger }) => {
  const driverRef = useRef<any>(null);

  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Concluir',
      allowClose: true,
      overlayColor: '#0f172a',
      overlayOpacity: 0.8,
      steps: [
        { 
          element: '#tour-sidebar', 
          popover: { 
            title: '🚀 Bem-vindo ao Munago!', 
            description: 'Este é o seu menu lateral. Aqui você pode navegar entre o Dashboard, a Planilha de registros, suas Metas e a integração bancária.',
            side: "right", 
            align: 'start' 
          } 
        },
        { 
          element: '#tour-welcome', 
          popover: { 
            title: '📊 Seu Painel de Controle', 
            description: 'No Dashboard, você tem uma visão estratégica completa da sua performance financeira e composição de receita.',
            side: "bottom", 
            align: 'center' 
          } 
        },
        { 
          element: '#tour-kpis', 
          popover: { 
            title: '💰 Indicadores Chave (KPIs)', 
            description: 'Acompanhe em tempo real o total geral, valores confirmados, pendências e o progresso em relação à sua meta mensal.',
            side: "bottom", 
            align: 'center' 
          } 
        },
        { 
          element: '#tour-charts', 
          popover: { 
            title: '📈 Gráficos e Tendências', 
            description: 'Analise o ranking de unidades, a composição por categoria e a evolução mensal através de gráficos interativos.',
            side: "top", 
            align: 'center' 
          } 
        },
        { 
          element: '#tour-new-btn', 
          popover: { 
            title: '➕ Atalho Rápido', 
            description: 'Precisa adicionar um novo registro rapidamente? Use este botão de qualquer lugar do sistema.',
            side: "bottom", 
            align: 'end' 
          } 
        },
        { 
          element: '#tour-theme-toggle', 
          popover: { 
            title: '🌓 Modo Escuro', 
            description: 'Alterne entre o tema claro e escuro conforme sua preferência de visualização.',
            side: "bottom", 
            align: 'end' 
          } 
        },
        { 
          element: '#tour-help-btn', 
          popover: { 
            title: '❓ Precisa de ajuda?', 
            description: 'Você pode reiniciar este tutorial a qualquer momento clicando neste botão de ajuda no topo.',
            side: "bottom", 
            align: 'end' 
          } 
        },
        { 
          popover: { 
            title: '✨ Tudo pronto!', 
            description: 'Agora você está pronto para explorar o Munago. Boas análises!',
          } 
        }
      ],
      onDestroyStarted: () => {
        localStorage.setItem('munago_tour_completed', 'true');
        driverObj.destroy();
      }
    });
    
    driverRef.current = driverObj;
    driverObj.drive();
  };

  useEffect(() => {
    const tourCompleted = localStorage.getItem('munago_tour_completed');
    
    if (!tourCompleted) {
      const timer = setTimeout(() => {
        startTour();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (runTrigger && runTrigger > 0) {
      startTour();
    }
  }, [runTrigger]);

  return null;
};
