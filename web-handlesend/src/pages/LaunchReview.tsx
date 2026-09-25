import { Navigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { useCreator } from '@/lib/creator';
import { ErrorState, Loading } from '@/components/Feedback';
import type { ObjectCommitment } from '@/shared/domain';

/** Older launch-status links (/launch/<record id>) forward to the live studio of the scan behind that record. */
export default function LaunchReview() {
  const { id = '' } = useParams(); const creator = useCreator();
  const query = useQuery({ queryKey: ['objectpad', 'record', id, creator.signedIn], queryFn: async () => api<{ commitment: ObjectCommitment; state: string }>(`/records/${id}`, { token: await creator.token() }), retry: false });
  if (query.isPending) return <Loading label="Reading your launch…"/>;
  if (query.data?.state === 'confirmed') return <Navigate to={`/objects/${id}`} replace/>;
  if (query.data) return <Navigate to={`/launch/${query.data.commitment.captureSessionId}`} replace/>;
  return <div className="page max-w-xl py-16"><ErrorState message="This launch belongs to another browser or account." retry={() => void query.refetch()}/><Link to="/launch" className="press mt-4 inline-flex min-h-11 items-center gap-2 btn px-5 text-sm font-semibold "><ScanLine size={15}/>Start a new scan</Link></div>;
}
