import { api_host } from '@/utils/api';
import { useCallback, useState } from 'react';

interface AdminLlmConfigResponse {
  configured: boolean;
  message: string;
}

export const useCheckAdminLlmConfig = () => {
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);

  const checkAdminConfig =
    useCallback(async (): Promise<AdminLlmConfigResponse> => {
      setLoading(true);
      try {
        const response = await fetch(`${api_host}/llm/check_admin_config`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        const data = await response.json();

        if (data.retcode === 0) {
          setConfigured(data.data.configured);
          return data.data;
        } else {
          console.error('Failed to check admin LLM config:', data.retmsg);
          return { configured: true, message: 'Check failed' };
        }
      } catch (error) {
        console.error('Error checking admin LLM config:', error);
        return { configured: true, message: 'Check failed' };
      } finally {
        setLoading(false);
      }
    }, []);

  return {
    loading,
    configured,
    checkAdminConfig,
  };
};
