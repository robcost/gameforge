import { use } from 'react';
import { StudioLayout } from '@/components/workspace/StudioLayout';

/**
 * Studio session page — renders the two-panel workspace layout.
 * Resolves the sessionId from the URL params and passes it to StudioLayout
 * for WebSocket connectivity.
 */
export default function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  return <StudioLayout sessionId={sessionId} />;
}
