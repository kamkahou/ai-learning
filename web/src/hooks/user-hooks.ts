import userService from '@/services/user-service';
import { useQuery } from '@tanstack/react-query';

export const useFetchUserInfo = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['userInfo'],
    queryFn: async () => {
      const { data } = await userService.user_info();
      if (data.code === 0) {
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to fetch user info');
      }
    },
    retry: false,
  });

  const role = data?.is_superuser ? 'admin' : 'user';

  return {
    userInfo: data,
    isLoading,
    isError,
    role: data ? role : undefined,
    isAuthenticated: !!data && !isError,
  };
};
