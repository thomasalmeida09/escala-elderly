import { useState, useEffect } from 'react';
import caregiversData from '../mocks/Caregive.json';

export interface Cuidador {
  id: number;
  nome: string;
  status: string;
}

export function useCaregivers() {
  const [cuidadores, setCuidadores] = useState<Cuidador[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Simula o "fetch" buscando dados de uma API externa
  useEffect(() => {
    const fetchCuidadores = async () => {
      setLoading(true);
      // Simula delay de 1.2 segundos de rede
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setCuidadores(caregiversData);
      setLoading(false);
    };

    fetchCuidadores();
  }, []);

  const simularFaltaDoCarlos = () => {
    setCuidadores((prev) =>
      prev.map((cuidador) => (cuidador.id === 3 ? { ...cuidador, status: 'Faltou' } : cuidador))
    );
  };

  return {
    cuidadores,
    loading,
    simularFaltaDoCarlos,
  };
}
