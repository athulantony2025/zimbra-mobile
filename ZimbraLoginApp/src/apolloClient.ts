import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import store from './store/store';

const ZIMBRA_ORIGIN = 'https://apps-development.zimbradev.com';
const GRAPHQL_ENDPOINT = '/service/extension/graphql';

const httpLink = new HttpLink({
  uri: `${ZIMBRA_ORIGIN}${GRAPHQL_ENDPOINT}`,
  credentials: 'same-origin'
});

const authLink = setContext(() => {
  const authToken = store.getState().auth.authToken;

  return {
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      ...(authToken && {
        Authorization: `Bearer ${authToken}`,
        Cookie: `ZM_AUTH_TOKEN=${authToken};`,
      }),
    }
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache()
});

export default client;
