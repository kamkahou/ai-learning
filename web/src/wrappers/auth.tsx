import { useFetchUserInfo } from '@/hooks/user-hooks';
import { redirectToLogin } from '@/utils/authorization-util';
import { Spin } from 'antd';
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
  const { userInfo, isLoading, isError, role } = useFetchUserInfo();
  const location = useLocation();
  const navigate = useNavigate();

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
      return <Outlet />; // Admin can access all pages
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
