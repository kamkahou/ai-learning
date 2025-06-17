import { useFetchUserInfo } from '@/hooks/user-hooks';
import { Flex } from 'antd';
import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'umi';
import SideBar from './sidebar';

import styles from './index.less';

const UserSetting = () => {
  const { role } = useFetchUserInfo();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (role === 'user' && location.pathname === '/user-setting') {
      navigate('/user-setting/password', { replace: true });
    }
  }, [role, location, navigate]);

  return (
    <Flex className={styles.settingWrapper}>
      <SideBar></SideBar>
      <Flex flex={1} className={styles.outletWrapper}>
        <Outlet></Outlet>
      </Flex>
    </Flex>
  );
};

export default UserSetting;
