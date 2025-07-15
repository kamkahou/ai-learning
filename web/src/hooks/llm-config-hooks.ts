import { api_host } from '@/utils/api';
import { getAuthorization } from '@/utils/authorization-util';
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
        const authToken = getAuthorization();

        // 如果沒有認證 token，直接返回
        if (!authToken) {
          console.warn(
            'No authorization token found, skipping admin config check',
          );
          return { configured: true, message: 'No authorization token' };
        }

        const response = await fetch(`${api_host}/llm/check_admin_config`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authToken,
          },
          credentials: 'include',
        });

        if (!response.ok) {
          // 處理 HTTP 錯誤
          const errorText = await response.text();
          console.error(
            `Failed to check admin LLM config: ${response.status} ${response.statusText}`,
            errorText,
          );

          if (response.status === 401) {
            // 未授權錯誤，可能是用戶未登錄
            return { configured: true, message: 'Unauthorized' };
          } else {
            return {
              configured: true,
              message: `HTTP ${response.status}: ${response.statusText}`,
            };
          }
        }

        const data = await response.json();

        if (data.code === 0) {
          setConfigured(data.data.configured);
          return data.data;
        } else {
          console.error(
            'Failed to check admin LLM config:',
            data.message || 'Unknown error',
          );
          return { configured: true, message: data.message || 'Check failed' };
        }
      } catch (error) {
        console.error('Error checking admin LLM config:', error);
        return { configured: true, message: 'Network error' };
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
