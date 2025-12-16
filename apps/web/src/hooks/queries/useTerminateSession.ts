import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/**
 * Mutation hook for terminating an active streaming session
 * Invalidates active sessions cache on success
 */
export function useTerminateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, reason }: { sessionId: string; reason?: string }) =>
      api.sessions.terminate(sessionId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
      toast.success('Stream Terminated', { description: 'The playback session has been stopped.' });
    },
    onError: (error: Error) => {
      toast.error('Failed to Terminate', { description: error.message });
    },
  });
}
