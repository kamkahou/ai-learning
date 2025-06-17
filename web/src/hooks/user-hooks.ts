import userService from '@/services/user-service';
import { useQuery } from '@tanstack/react-query';

export const useFetchUserInfo = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['userInfo'],
    queryFn: async () => {
      const { data } = await userService.user_info();
      return data.data;
    },
    retry: false,
  });

  const role = data?.is_superuser ? 'admin' : 'user';

  return { userInfo: data, isLoading, isError, role };
}; 