/* Run browser-independent frontend session contracts with the existing Jest toolchain. */
jest.mock(
  '../../frontend/node_modules/@ant-design/icons',
  () =>
    new Proxy(
      {},
      {
        get: (_target, key) => (key === '__esModule' ? true : () => null),
      },
    ),
);
const persisted = new Map<string, string>();
const storage = {
  getItem: (key: string) => persisted.get(key) ?? null,
  setItem: (key: string, value: string) => persisted.set(key, value),
  removeItem: (key: string) => persisted.delete(key),
};
const dispatchEvent = jest.fn();
const location = { href: '' };
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: storage, location, dispatchEvent },
  configurable: true,
});

// Load after browser storage is installed so the real persistence middleware is exercised.
const { useAuthStore } =
  require('../../frontend/src/lib/auth/store') as typeof import('../../frontend/src/lib/auth/store');
const { useLayoutStore } =
  require('../../frontend/src/components/layout/layoutStore') as typeof import('../../frontend/src/components/layout/layoutStore');
const { apiClient, AUTHORIZATION_CHANGED } =
  require('../../frontend/src/lib/api/client') as typeof import('../../frontend/src/lib/api/client');
const { Role } =
  require('../../frontend/src/lib/auth/role') as typeof import('../../frontend/src/lib/auth/role');
const { canAccessPath, landingPath, getNavGroups } =
  require('../../frontend/src/components/layout/navModel') as typeof import('../../frontend/src/components/layout/navModel');
import type { NavigationMenu } from '../../frontend/src/lib/auth/role';

const navigation = [
  {
    key: 'customers',
    path: '/customers',
    permission: 'menu:customers',
    group: 'partners',
  },
  {
    key: 'carriers',
    path: '/carriers',
    permission: 'menu:carriers',
    group: 'partners',
  },
  {
    key: 'finance',
    path: '/finance',
    permission: 'menu:finance',
    group: 'finance',
  },
  {
    key: 'transport-finance',
    path: '/finance/transport',
    permission: 'menu:transport-finance',
    group: 'finance',
  },
] as NavigationMenu[];

function login(organizationId: string, permissions: string[]) {
  useAuthStore.getState().setAuth({
    token: 'token-' + organizationId,
    user: {
      id: 'user',
      username: 'user',
      displayName: 'User',
      email: null,
      role: Role.ORG_ADMIN,
    },
    mode: 'SINGLE_ORG',
    activeOrgId: organizationId,
    memberships: [],
    externalContext: null,
    accountUnit: {
      type: 'ORG',
      id: organizationId,
      name: organizationId,
      code: organizationId,
    },
    permissions,
    navigation,
  });
}
function openCustomerTab() {
  useLayoutStore
    .getState()
    .openTab({
      key: 'customers',
      path: '/customers',
      i18nKey: 'nav.customers',
      closable: true,
    });
}
// Axios adapter lets responses resolve in an arbitrary order without making network requests.
async function pendingRequest() {
  let succeed!: () => void;
  let fail!: (status: number) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const request = apiClient.get('/customers', {
    adapter: (config) =>
      new Promise((resolve, reject) => {
        succeed = () =>
          resolve({
            config,
            data: { secret: 'organization A' },
            headers: {},
            status: 200,
            statusText: 'OK',
          });
        fail = (status) => reject({ config, response: { status, data: {} } });
        started();
      }),
  });
  await ready;
  return { request, succeed, fail };
}

beforeEach(() => {
  useAuthStore.getState().logout();
  useLayoutStore.getState().clearTabs();
  useLayoutStore.setState({ contextKey: null });
  location.href = '';
  dispatchEvent.mockClear();
});

it('replaces grants on organization switch instead of merging, including an empty-grant membership', () => {
  login('A', ['menu:customers']);
  login('B', ['menu:carriers']);
  expect(useAuthStore.getState().permissions).toEqual(['menu:carriers']);
  expect(useAuthStore.getState().activeOrgId).toBe('B');
  login('C', []);
  expect(useAuthStore.getState().permissions).toEqual([]);
  expect(getNavGroups(navigation, [])).toEqual([]);
});

it('preauthorization and logout clear all business permissions and scope', () => {
  login('A', ['menu:customers']);
  useAuthStore
    .getState()
    .setPreAuth({
      token: 'pre',
      user: useAuthStore.getState().user!,
      memberships: [],
      permissions: ['menu:customers'],
    });
  expect(useAuthStore.getState()).toMatchObject({
    mode: 'NEEDS_SELECTION',
    activeOrgId: null,
    permissions: [],
    navigation: [],
    accountUnit: null,
  });
  useAuthStore.getState().logout();
  expect(useAuthStore.getState()).toMatchObject({
    token: null,
    user: null,
    memberships: [],
    permissions: [],
  });
});

it('scopes persisted tabs to user, organization and yard, without a forced dashboard tab', () => {
  const layout = useLayoutStore.getState();
  expect(layout.tabs).toEqual([]);
  layout.setContext('user:A:yard1');
  openCustomerTab();
  layout.setContext('user:A:yard1');
  expect(useLayoutStore.getState().tabs).toHaveLength(1);
  for (const key of ['user:B:yard1', 'user:B:yard2', 'other:B:yard2']) {
    openCustomerTab();
    layout.setContext(key);
    expect(useLayoutStore.getState().tabs).toEqual([]);
  }
});

it('denies unknown and ungranted routes; a parent menu does not grant a separately protected child', () => {
  expect(canAccessPath('/customers/123', ['menu:customers'], navigation)).toBe(
    true,
  );
  expect(canAccessPath('/carriers', ['menu:customers'], navigation)).toBe(
    false,
  );
  expect(
    canAccessPath('/finance/transport', ['menu:finance'], navigation),
  ).toBe(false);
  expect(canAccessPath('/unknown', ['menu:customers'], navigation)).toBe(false);
  expect(landingPath(navigation, ['menu:carriers'])).toBe('/carriers');
});

it('drops a delayed successful response from the previous organization', async () => {
  login('A', ['menu:customers']);
  const pending = await pendingRequest();
  login('B', ['menu:carriers']);
  pending.succeed();
  await expect(pending.request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
});

it('an old organization 401 must not log out the newly selected organization', async () => {
  login('A', ['menu:customers']);
  const pending = await pendingRequest();
  login('B', ['menu:carriers']);
  openCustomerTab();
  pending.fail(401);
  await expect(pending.request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(useAuthStore.getState().token).toBe('token-B');
  expect(location.href).toBe('');
  expect(useLayoutStore.getState().tabs).toHaveLength(1);
});

it('a current session 401 clears authentication and tabs and returns to login', async () => {
  login('A', ['menu:customers']);
  openCustomerTab();
  const pending = await pendingRequest();
  pending.fail(401);
  await expect(pending.request).rejects.toMatchObject({
    response: { status: 401 },
  });
  expect(useAuthStore.getState().token).toBeNull();
  expect(useLayoutStore.getState().tabs).toEqual([]);
  expect(location.href).toBe('/login');
});

it('a current session 403 requests permission revalidation, whereas an old session 403 does not', async () => {
  login('A', ['menu:customers']);
  const current = await pendingRequest();
  current.fail(403);
  await expect(current.request).rejects.toMatchObject({
    response: { status: 403 },
  });
  expect(dispatchEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: AUTHORIZATION_CHANGED }),
  );
  dispatchEvent.mockClear();
  const old = await pendingRequest();
  login('B', []);
  old.fail(403);
  await expect(old.request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(dispatchEvent).not.toHaveBeenCalled();
});
