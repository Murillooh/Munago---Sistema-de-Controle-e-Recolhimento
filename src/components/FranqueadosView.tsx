import React, { useEffect, useState } from 'react';
import { Store, Search, RefreshCw, Mail, Phone, MapPin, AlertCircle, Loader2 } from 'lucide-react';
import { Unidade, AuthUser } from '../types';

interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  address: string;
  unidadeNome: string;
}

interface FranqueadosViewProps {
  unidades: Unidade[];
  currentUser: AuthUser | null;
  sessionToken: string | null;
}

// Lista os clientes (franqueados) já cadastrados em cada conta ASAAS — pura
// consulta ao vivo, sem persistir nada e sem mexer em Unidades/Cobranças.
// Só existe pra quem tem chave ASAAS configurada numa Unidade (Bases).
export const FranqueadosView: React.FC<FranqueadosViewProps> = ({ unidades, currentUser, sessionToken }) => {
  const [customers, setCustomers] = useState<AsaasCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const unidadesComChave = unidades.filter((u) => {
    if (!u.hasAsaasKey) return false;
    if (currentUser?.role === 'admin' || currentUser?.allowedAsaasBases === null || currentUser?.allowedAsaasBases === undefined) return true;
    return currentUser?.allowedAsaasBases?.includes(u.id);
  });

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  });

  const loadCustomers = async () => {
    if (unidadesComChave.length === 0) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    const allCustomers: AsaasCustomer[] = [];
    const newErrors: string[] = [];

    for (const unidade of unidadesComChave) {
      let offset = 0;
      const MAX_PAGES = 50; // trava de segurança: até 5000 clientes por unidade
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const res = await fetch('/api/asaas/list-customers', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ unidadeId: unidade.id, sandbox: false, offset }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            newErrors.push(`${unidade.nome}: ${data.error || `HTTP ${res.status}`}`);
            break;
          }
          const data = await res.json();
          const pageCustomers = Array.isArray(data.customers) ? data.customers : [];
          for (const c of pageCustomers) {
            allCustomers.push({ ...c, unidadeNome: unidade.nome });
          }
          if (!data.hasMore) break;
          offset = data.nextOffset ?? offset + pageCustomers.length;
        }
      } catch (err: any) {
        newErrors.push(`${unidade.nome}: falha ao comunicar com a API do ASAAS.`);
      }
    }

    setCustomers(allCustomers);
    setErrors(newErrors);
    setLoading(false);
  };

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadesComChave.map((u) => u.id).sort().join(',')]);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.cpfCnpj.includes(search) ||
      c.unidadeNome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
            <Store className="w-5 h-5 text-blue-600" />
            <span>Franqueados</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Clientes já cadastrados nas contas ASAAS das Unidades — puxado direto de lá, só consulta.
          </p>
        </div>

        <button
          onClick={loadCustomers}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-blue-600/20 uppercase tracking-widest"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
        </button>
      </div>

      {unidadesComChave.length === 0 && (
        <div className="flex items-center space-x-2 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Nenhuma Unidade com chave ASAAS configurada (Bases &gt; Unidades) ou liberada pro seu usuário.</span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="flex items-start space-x-2 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-2xl text-xs text-rose-700 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {errors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CNPJ ou unidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 outline-none"
            />
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {filtered.length} franqueado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">CNPJ</th>
                <th className="py-3 px-4">Contato</th>
                <th className="py-3 px-4">Cidade/UF</th>
                <th className="py-3 px-4">Unidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-500 italic">
                    Puxando franqueados do ASAAS...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400 dark:text-slate-500 italic bg-slate-50/30 dark:bg-slate-800/30">
                    Nenhum franqueado encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={`${c.unidadeNome}-${c.id}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-slate-100">{c.name}</td>
                    <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{c.cpfCnpj}</td>
                    <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col gap-0.5">
                        {c.email && (
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <Mail className="w-3 h-3 shrink-0" />
                            {c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1.5 text-[11px]">
                            <Phone className="w-3 h-3 shrink-0" />
                            {c.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                      {(c.city || c.state) && (
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {[c.city, c.state].filter(Boolean).join(' / ')}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full text-[10px] font-bold uppercase tracking-wide">
                        {c.unidadeNome}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
