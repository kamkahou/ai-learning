import { useTranslate } from '@/hooks/common-hooks';
import { useFetchAppConf } from '@/hooks/logic-hooks';
import { useNavigateWithFromState } from '@/hooks/route-hook';
import { useFetchUserInfo } from '@/hooks/user-hooks';
import {
  ApartmentOutlined,
  FileTextOutlined,
  MessageOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Flex, Layout, Radio, Space, theme } from 'antd';
import { MouseEventHandler, useCallback, useMemo } from 'react';
import { useLocation } from 'umi';
import Toolbar from '../right-toolbar';

import { useTheme } from '@/components/theme-provider';
import styles from './index.less';

const { Header } = Layout;

const RagHeader = () => {
  const {
    token: { colorBgContainer },
  } = theme.useToken();
  const navigate = useNavigateWithFromState();
  const { pathname } = useLocation();
  const { t } = useTranslate('header');
  const appConf = useFetchAppConf();
  const { theme: themeRag } = useTheme();
  const { role } = useFetchUserInfo();

  const allTagsData = useMemo(
    () => [
      {
        path: '/knowledge',
        name: t('knowledgeBase'),
        icon: ApartmentOutlined,
        roles: ['admin'],
      },
      { path: '/chat', name: t('chat'), icon: MessageOutlined, roles: ['admin', 'user'] },
      { path: '/search', name: t('search'), icon: SearchOutlined, roles: ['admin'] },
      { path: '/flow', name: t('flow'), icon: ApartmentOutlined, roles: ['admin'] },
      { path: '/file', name: t('fileManager'), icon: FileTextOutlined, roles: ['admin'] },
    ],
    [t],
  );

  const tagsData = useMemo(() => {
    if (role === 'admin') {
      return allTagsData.filter(item => item.roles.includes('admin'));
    }
    if (role === 'user') {
      return allTagsData.filter(item => item.roles.includes('user'));
    }
    return [];
  }, [allTagsData, role]);

  const currentPath = useMemo(() => {
    return tagsData.find((x) => pathname.startsWith(x.path))?.name || 'chat';
  }, [pathname, tagsData]);

  const handleChange = useCallback(
    (path: string): MouseEventHandler =>
      (e) => {
        e.preventDefault();
        navigate(path);
      },
    [navigate],
  );

  const handleLogoClick = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return (
    <Header
      style={{
        padding: '0 16px',
        background: colorBgContainer,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '120px',
        position: 'relative',
      }}
    >
      <Space size={12} className={styles.logoWrapper}>
        <img src="/logo.png" alt="" className={styles.appIcon} />
        <span className={styles.appName}>{appConf.appName}</span>
      </Space>
      <Space size={[0, 8]} wrap>
        <Radio.Group
          defaultValue="a"
          buttonStyle="solid"
          className={
            themeRag === 'dark' ? styles.radioGroupDark : styles.radioGroup
          }
          value={currentPath}
        >
          {tagsData.map((item, index) => (
            <Radio.Button
              className={`${themeRag === 'dark' ? 'dark' : 'light'} ${index === 0 ? 'first' : ''} ${index === tagsData.length - 1 ? 'last' : ''}`}
              value={item.name}
              key={item.name}
            >
              <a href={item.path}>
                <Flex
                  align="center"
                  gap={8}
                  onClick={handleChange(item.path)}
                  className="cursor-pointer"
                >
                  <item.icon
                    className={styles.radioButtonIcon}
                  ></item.icon>
                  {item.name}
                </Flex>
              </a>
            </Radio.Button>
          ))}
        </Radio.Group>
      </Space>
      <div style={{ position: 'absolute', right: '16px' }}>
        <Toolbar />
      </div>
    </Header>
  );
};

export default RagHeader;
