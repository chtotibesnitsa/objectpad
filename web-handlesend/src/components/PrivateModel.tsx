import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CaptureSession } from '@/shared/domain';
import { sha256 } from '@/shared/security';
import { API_BASE } from '@/lib/api';
import { useSessionCaller } from '@/lib/creator';
import { ErrorState, Loading } from './Feedback';

const ModelViewer = lazy(() => import('./ModelViewer'));

/**
 * The creator's not-yet-public model and preview (owner, guest or paired phone credentials), each checked against its
 * recorded SHA-256 before use. Shared by the viewer and the coin-icon snapshot so the model downloads once.
 */
export function usePrivateArtifacts(session: CaptureSession) {
  const { download } = useSessionCaller(session.id); const model = session.model;
  return useQuery({
    queryKey: ['objectpad', 'private-artifacts', session.id, model?.optimizedHash], enabled: Boolean(model), retry: 1, gcTime: 60_000, staleTime: Infinity,
    queryFn: async () => {
      const verified = async (hash: string): Promise<Blob> => { const blob = await download(`${API_BASE}/artifacts/${hash}`); if (await sha256(new Uint8Array(await blob.arrayBuffer())) !== hash) throw new Error('The downloaded model did not match its recorded hash, so it is not shown.'); return blob; };
      return { model: await verified(model!.optimizedHash), poster: await verified(model!.thumbnailHash), hash: model!.optimizedHash };
    },
  });
}

/** Renders the private model from local object URLs once both hashes check out. */
export function PrivateModel({ session, height }: { session: CaptureSession; height?: string }) {
  const artifacts = usePrivateArtifacts(session); const [urls, setUrls] = useState<{ model: string; poster: string } | null>(null);
  useEffect(() => { if (!artifacts.data) return; const next = { model: URL.createObjectURL(artifacts.data.model), poster: URL.createObjectURL(artifacts.data.poster) }; setUrls(next); return () => { URL.revokeObjectURL(next.model); URL.revokeObjectURL(next.poster); }; }, [artifacts.data]);
  if (artifacts.isError) return <ErrorState message={artifacts.error.message} retry={() => void artifacts.refetch()}/>;
  if (!urls) return <div className={`glass flex items-center justify-center rounded-[28px] ${height ?? 'h-[430px]'}`}><Loading label="Verifying model hashes…"/></div>;
  return <Suspense fallback={<Loading/>}><ModelViewer src={urls.model} poster={urls.poster} height={height} autoLoad label="Your 3D model · hash verified"/></Suspense>;
}
