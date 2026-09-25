import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle, ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { BuildLattice } from '@/components/BuildLattice';
import { ErrorState } from '@/components/Feedback';
import { ObjectView } from './ObjectDetail';

/**
 * Permanent coin link (/o/<code>), fixed before launch and written into the Pons launch as the coin's website.
 * Live coins render their full page here; a reserved code shows that the coin is on its way.
 */
export default function CoinLink() {
  const { code = '' } = useParams(); const valid = /^[a-f0-9]{12}$/.test(code);
  const query = useQuery({ queryKey: ['objectpad', 'short', code], enabled: valid, queryFn: () => api<{ state: 'live' | 'reserved'; objectId?: string }>(`/objects/short/${code}`), retry: false, refetchInterval: q => q.state.data?.state === 'reserved' ? 8000 : false });
  if (!valid) return <div className="page max-w-xl py-16"><ErrorState message="This coin link isn’t valid."/></div>;
  if (query.isPending) return <div className="flex min-h-[60vh] items-center justify-center text-muted"><LoaderCircle className="animate-spin"/></div>;
  if (query.data?.state === 'live' && query.data.objectId) return <ObjectView id={query.data.objectId}/>;
  if (query.data?.state === 'reserved') return <div className="page py-10"><div className="glass mx-auto grid max-w-4xl items-center gap-6 overflow-hidden rounded-[30px] md:grid-cols-2"><div className="relative h-72 md:h-full md:min-h-[380px]"><BuildLattice progress={60} mode="search" className="absolute inset-0"/></div><div className="p-6 sm:p-8"><p className="spec">objectpad · /o/{code}</p><h1 className="display mt-3 text-4xl">This coin is on its way.</h1><p className="mt-3 text-[15px] leading-7 text-muted">A real object has been scanned and this link is reserved for its coin. The page goes live here the moment the launch confirms on Robinhood Chain.</p><Link to="/launch" className="press mt-6 inline-flex min-h-12 items-center gap-2 btn px-5 text-sm font-semibold "><ScanLine size={16}/>Tokenize your own object</Link></div></div></div>;
  return <div className="page max-w-xl py-16"><ErrorState message="No coin uses this link." retry={() => void query.refetch()}/></div>;
}
