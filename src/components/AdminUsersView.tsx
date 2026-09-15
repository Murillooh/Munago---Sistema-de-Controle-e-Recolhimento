import React, { useEffect, useState } from 'react';
import { ActiveTab, AuthUser, PERMISSION_TABS } from '../types';
import { Users, ShieldCheck, ShieldX, ShieldAlert, Clock, RefreshCw, ShieldOff, Crown, KeyRound, Copy, Check, X, Trash2, SlidersHorizontal } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface AdminUsersViewProps {
  sessionToken: string | null;
  currentUserId: string;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({ sessionToken, currentUserId }) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ user: AuthUser; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);
  const [permTarget, setPermTarget] = useState<AuthUser | null>(null);
  const [permFullAccess, setPermFullAccess] = useState(true);
  const [permSelection, setPermSelection] = useState<Set<ActiveTab>>(new Set());

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  };

  const loadUsers = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao carregar usuários.');
        return;
      }
      setUsers(data);
    } catch {
      setErrorMsg('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUser = async (id: string, patch: { status?: string; role?: string; allowedTabs?: ActiveTab[] | null }) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === id ? data : u)));
      } else {
        alert(data.error || 'Erro ao atualizar usuário.');
      }
    } catch {
      alert('Erro de conexão com o servidor.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (user: AuthUser) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
      } else {
        alert(data.error || 'Erro ao excluir usuário.');
      }
    } catch {
      alert('Erro de conexão com o servidor.');
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  const resetPassword = async (user: AuthUser) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json();
      if (res.ok) {
        setResetResult({ user, password: data.tempPassword });
        setCopied(false);
      } else {
        alert(data.error || 'Erro ao redefinir senha.');
      }
    } catch {
      alert('Erro de conexão com o servidor.');
    } finally {
      setBusyId(null);
    }
  };

  const openPermissions = (user: AuthUser) => {
    setPermTarget(user);
    setPermFullAccess(!user.allowedTabs);
    setPermSelection(new Set(user.allowedTabs || PERMISSION_TABS.map((t) => t.id)));
  };

  const togglePermTab = (tab: ActiveTab) => {
    setPermSelection((prev) => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      return next;
    });
  };

  const savePermissions = async () => {
    if (!permTarget) return;
    await updateUser(permTarget.id, { allowedTabs: permFullAccess ? null : Array.from(permSelection) });
    setPermTarget(null);
  };

  const pendingUsers = users.filter((u) => u.status === 'pending');
  const otherUsers = users.filter((u) => u.status !== 'pending');

  const statusBadge = (status: AuthUser['status']) => {
    const map: Record<string, string> = {
      approved: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
      pending: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
      rejected: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
    };
    const label: Record<string, string> = { approved: 'Aprovado', pending: 'Pendente', rejected: 'Rejeitado' };
    return (
      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${map[status]}`}>
        {label[status]}
      </span>
    );
  };

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-white/10">
        <div className="absolute right-0 top-0 -translate-x-12 translate-y-12 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Usuários do Sistema</h2>
              <p className="text-[10px] text-blue-200 uppercase font-bold tracking-widest mt-0.5">
                Aprove ou rejeite novos cadastros
              </p>
            </div>
          </div>
          <button
            onClick={loadUsers}
            className="flex items-center space-x-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Pending approvals */}
      <div>
        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>Aguardando Aprovação ({pendingUsers.length})</span>
        </h3>

        {pendingUsers.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            Nenhum cadastro pendente no momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 flex flex-col gap-3"
              >
                <div className="flex items-start space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{user.name}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busyId === user.id}
                    onClick={() => updateUser(user.id, { status: 'approved' })}
                    className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Aprovar</span>
                  </button>
                  <button
                    disabled={busyId === user.id}
                    onClick={() => updateUser(user.id, { status: 'rejected' })}
                    className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 disabled:opacity-50 text-rose-600 dark:text-rose-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-rose-200 dark:border-rose-800/50"
                  >
                    <ShieldX className="w-3.5 h-3.5" />
                    <span>Rejeitar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All other users */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Todos os Usuários ({otherUsers.length})
        </h3>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 px-6">Nome</th>
                  <th className="py-3 px-6">E-mail</th>
                  <th className="py-3 px-6">Papel</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-300">
                {otherUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                      Nenhum outro usuário ainda.
                    </td>
                  </tr>
                ) : (
                  otherUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-6 font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                        {user.role === 'admin' && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        <span>{user.name}</span>
                        {user.id === currentUserId && (
                          <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">(Você)</span>
                        )}
                      </td>
                      <td className="py-3 px-6 font-mono text-slate-500 dark:text-slate-400">{user.email}</td>
                      <td className="py-3 px-6">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                          user.role === 'admin'
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                          {user.role === 'admin' ? 'Admin' : 'Usuário'}
                        </span>
                        {user.role !== 'admin' && user.allowedTabs && (
                          <span
                            title={PERMISSION_TABS.filter((t) => user.allowedTabs!.includes(t.id)).map((t) => t.label).join(', ') || 'Nenhuma aba liberada'}
                            className="ml-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                          >
                            {user.allowedTabs.length}/{PERMISSION_TABS.length} abas
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-6">{statusBadge(user.status)}</td>
                      <td className="py-3 px-6 text-right">
                        {user.id !== currentUserId && (
                          <div className="flex items-center justify-end gap-1.5">
                            {user.status !== 'approved' && (
                              <button
                                disabled={busyId === user.id}
                                onClick={() => updateUser(user.id, { status: 'approved' })}
                                title="Aprovar"
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {user.status !== 'rejected' && (
                              <button
                                disabled={busyId === user.id}
                                onClick={() => updateUser(user.id, { status: 'rejected' })}
                                title="Revogar acesso"
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                              >
                                <ShieldOff className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              disabled={busyId === user.id}
                              onClick={() => resetPassword(user)}
                              title="Redefinir senha"
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            {user.role !== 'admin' && (
                              <button
                                disabled={busyId === user.id}
                                onClick={() => openPermissions(user)}
                                title="Permissões de abas"
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {user.role !== 'admin' ? (
                              <button
                                disabled={busyId === user.id}
                                onClick={() => updateUser(user.id, { role: 'admin' })}
                                title="Tornar admin"
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                              >
                                <Crown className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                disabled={busyId === user.id}
                                onClick={() => updateUser(user.id, { role: 'user' })}
                                title="Remover admin"
                                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                              >
                                <ShieldX className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              disabled={busyId === user.id}
                              onClick={() => setDeleteTarget(user)}
                              title="Excluir usuário"
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Senha temporária gerada — repassar pro usuário direto (WhatsApp/e-mail) */}
      {resetResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setResetResult(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-lg shadow-amber-500/20">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">Senha redefinida</h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold truncate max-w-[180px]">{resetResult.user.name}</p>
                </div>
              </div>
              <button
                onClick={() => setResetResult(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sessões antigas desse usuário foram encerradas. Repasse a senha abaixo por um canal seguro — ela só aparece agora, uma vez.
              </p>

              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                <code className="flex-1 text-sm font-black text-slate-900 dark:text-slate-100 tracking-widest">{resetResult.password}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resetResult.password).catch(() => {});
                    setCopied(true);
                  }}
                  className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0"
                  title="Copiar"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permissões de abas — só se aplica a usuários comuns; admin sempre vê tudo */}
      {permTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setPermTarget(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20 shrink-0">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">Permissões de abas</h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold truncate">{permTarget.name}</p>
                </div>
              </div>
              <button
                onClick={() => setPermTarget(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <label className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Acesso total</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Libera todas as abas, inclusive as futuras.</p>
                </div>
                <input
                  type="checkbox"
                  checked={permFullAccess}
                  onChange={(e) => setPermFullAccess(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 shrink-0"
                />
              </label>

              {!permFullAccess && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {PERMISSION_TABS.map((tab) => (
                    <label
                      key={tab.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={permSelection.has(tab.id)}
                        onChange={() => togglePermTab(tab.id)}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      {tab.label}
                    </label>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setPermTarget(null)}
                  className="flex-1 px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button
                  disabled={busyId === permTarget.id}
                  onClick={savePermissions}
                  className="flex-1 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir usuário"
        message={`Tem certeza que deseja excluir "${deleteTarget?.name}"? Os lançamentos criados por essa conta continuam no sistema, só o acesso é removido.`}
        confirmLabel="Excluir"
        onConfirm={() => deleteTarget && deleteUser(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
