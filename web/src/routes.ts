export enum Routes {
  Login = '/login',
  Chat = '/next-chat',
  DatasetTesting = '/testing',
  DatasetSetting = '/setting',
  Parsed = '/parsed',
  Result = '/result',
}

const routes = [
  {
    path: '/login',
    component: '@/pages/login',
    layout: false,
  },
  {
    path: '/chat/share',
    component: '@/pages/chat/share',
    layout: false,
  },
  {
    path: '/',
    component: '@/layouts',
    layout: false,
    wrappers: ['@/wrappers/auth'],
    routes: [
      { path: '/', redirect: '/chat' },
      {
        path: '/knowledge',
        component: '@/pages/knowledge',
      },
      {
        path: '/knowledge',
        component: '@/pages/add-knowledge',
        routes: [
          {
            path: '/knowledge/dataset',
            component: '@/pages/add-knowledge/components/knowledge-dataset',
            routes: [
              {
                path: '/knowledge/dataset',
                component: '@/pages/add-knowledge/components/knowledge-file',
              },
              {
                path: '/knowledge/dataset/chunk',
                component: '@/pages/add-knowledge/components/knowledge-chunk',
              },
            ],
          },
          {
            path: '/knowledge/configuration',
            component: '@/pages/add-knowledge/components/knowledge-setting',
          },
          {
            path: '/knowledge/testing',
            component: '@/pages/add-knowledge/components/knowledge-testing',
          },
          {
            path: '/knowledge/knowledgeGraph',
            component: '@/pages/add-knowledge/components/knowledge-graph',
          },
        ],
      },
      {
        path: '/chat',
        component: '@/pages/chat',
      },
      {
        path: '/chat-setting',
        component: '@/pages/chat-setting',
      },
      {
        path: '/user-setting',
        component: '@/pages/user-setting',
        routes: [
          { path: '/user-setting', redirect: '/user-setting/profile' },
          {
            path: '/user-setting/profile',
            component: '@/pages/user-setting/setting-profile',
          },
          {
            path: '/user-setting/locale',
            component: '@/pages/user-setting/setting-locale',
          },
          {
            path: '/user-setting/password',
            component: '@/pages/user-setting/setting-password',
          },
          {
            path: '/user-setting/model',
            component: '@/pages/user-setting/setting-model',
          },
          {
            path: '/user-setting/team',
            component: '@/pages/user-setting/setting-team',
          },
          {
            path: '/user-setting/system',
            component: '@/pages/user-setting/setting-system',
          },
          {
            path: '/user-setting/api',
            component: '@/pages/user-setting/setting-api',
          },
          {
            path: '/user-setting/question-record',
            component: '@/pages/user-setting/setting-question-record',
          },
          {
            path: '/user-setting/token-usage',
            component: '@/pages/user-setting/setting-token-usage',
          },
        ],
      },
      {
        path: '/file',
        component: '@/pages/file-manager',
      },
      {
        path: '/flow',
        component: '@/pages/flow/list',
      },
      {
        path: '/flow/:id',
        component: '@/pages/flow',
      },
      {
        path: '/search',
        component: '@/pages/search',
      },
      {
        path: '/unauthorized',
        component: '@/pages/Unauthorized',
      },
    ],
  },
  {
    path: '/document/:id',
    component: '@/pages/document-viewer',
    layout: false,
  },
  {
    path: '/*',
    component: '@/pages/404',
    layout: false,
  },
];

export default routes;
