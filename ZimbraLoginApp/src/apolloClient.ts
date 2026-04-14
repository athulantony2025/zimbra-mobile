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
  const csrfToken = store.getState().auth.csrfToken;

  return {
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      ...(csrfToken && { 'X-Zimbra-Csrf-Token': csrfToken })
    }
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache()
});

export default client;