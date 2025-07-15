import LlmConfigReminder from '@/components/llm-config-reminder';
import { useCheckAdminLlmConfig } from '@/hooks/llm-config-hooks';
import { useFetchUserInfo } from '@/hooks/user-hooks';
import { redirectToLogin } from '@/utils/authorization-util';
import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'umi';

// Define routes accessible by a general user
const userRoutes = [
  '/login',
  '/chat',
  '/user-setting/password',
  '/user-setting/profile',
  '/user-setting/locale',
  '/user-setting',
  '/unauthorized',
];

export default () => {
  const { userInfo, isLoading, isError, role, isAuthenticated } =
    useFetchUserInfo();
  const {
    loading: llmConfigLoading,
    configured,
    checkAdminConfig,
  } = useCheckAdminLlmConfig();
  const [showLlmReminder, setShowLlmReminder] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Check admin LLM configuration on mount and when user becomes admin
  useEffect(() => {
    if (
      isAuthenticated &&
      role === 'admin' &&
      userInfo &&
      !showLlmReminder &&
      !isLoading
    ) {
      checkAdminConfig()
        .then((result) => {
          if (!result.configured) {
            setShowLlmReminder(true);
          }
        })
        .catch((error) => {
          console.error('Error checking admin config:', error);
        });
    }
  }, [
    isAuthenticated,
    role,
    userInfo,
    checkAdminConfig,
    showLlmReminder,
    isLoading,
  ]);

  // Reset reminder state when user logs out or role changes
  useEffect(() => {
    if (!isAuthenticated || role !== 'admin') {
      setShowLlmReminder(false);
    }
  }, [isAuthenticated, role]);

  const handleCloseLlmReminder = () => {
    setShowLlmReminder(false);
  };

  const handleGoToSettings = () => {
    setShowLlmReminder(false);
    navigate('/user-setting/model');
  };

  // Re-check configuration when returning from settings page
  useEffect(() => {
    if (
      role === 'admin' &&
      userInfo &&
      location.pathname !== '/user-setting/model' &&
      showLlmReminder
    ) {
      // Small delay to allow for potential configuration changes
      const timeoutId = setTimeout(() => {
        checkAdminConfig().then((result) => {
          if (result.configured) {
            setShowLlmReminder(false);
          }
        });
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [location.pathname, role, userInfo, showLlmReminder, checkAdminConfig]);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (isError) {
    redirectToLogin();
    return null;
  }

  if (userInfo) {
    const { pathname } = location;

    if (role === 'admin') {
      return (
        <>
          <Outlet />
          <LlmConfigReminder
            visible={showLlmReminder}
            onClose={handleCloseLlmReminder}
            onGoToSettings={handleGoToSettings}
          />
        </>
      );
    }

    if (role === 'user') {
      const isAllowed = userRoutes.some((route) => pathname.startsWith(route));
      if (isAllowed) {
        // 如果普通用户访问根路径，重定向到chat
        if (pathname === '/') {
          navigate('/chat', { replace: true });
          return null;
        }
        return <Outlet />;
      } else {
        navigate('/unauthorized', { replace: true });
        return null;
      }
    }
  }

  return null; // Should be handled by the isError case which redirects
};
