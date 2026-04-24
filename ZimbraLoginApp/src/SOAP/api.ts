const BASE_URL = 'https://apps-development.zimbradev.com';

type SoapNamespace = 'urn:zimbraMail' | 'urn:zimbraAccount' | string;

type SoapBody = Record<string, unknown> | undefined;

type SoapCallParams = {
  authToken: unknown;
  requestName: string;
  bodyPayload?: Record<string, unknown>;
  namespace?: SoapNamespace;
  contextPayload?: Record<string, unknown>;
  includeContextAuthToken?: boolean;
  includeAuthorizationHeader?: boolean;
};

type SoapFault = {
  Reason?: {
    Text?: string;
  } | Array<{ Text?: string }>;
};

export const getAuthToken = (raw: unknown) => {
  if (typeof raw === 'string') return raw.replace(/^Bearer\s+/i, '').trim();
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { _content?: string })._content === 'string'
  ) {
    return (raw as { _content: string })._content.trim();
  }
  return '';
};

const extractSoapBody = (data: any): SoapBody =>
  Array.isArray(data?.Body) ? data.Body[0] : data?.Body;

const extractSoapFault = (body: SoapBody): SoapFault | undefined =>
  Array.isArray(body?.Fault) ? body.Fault[0] : (body?.Fault as SoapFault | undefined);

const extractSoapResponse = (body: SoapBody, requestName: string) => {
  const responseName = requestName.endsWith('Request')
    ? requestName.replace(/Request$/, 'Response')
    : `${requestName}Response`;
  const responsePayload = body?.[responseName];
  return Array.isArray(responsePayload) ? responsePayload[0] : responsePayload;
};

export const callSoapApi = async <TResponse,>({
  authToken,
  requestName,
  bodyPayload = {},
  namespace = 'urn:zimbraMail',
  contextPayload = {},
  includeContextAuthToken = true,
  includeAuthorizationHeader = true,
}: SoapCallParams): Promise<TResponse> => {
  const token = getAuthToken(authToken);
  if (!token) {
    throw new Error('Missing auth token. Please login again.');
  }

  const payload = {
    Header: {
      context: {
        _jsns: 'urn:zimbra',
        ...(includeContextAuthToken ? { authToken: token } : {}),
        ...contextPayload,
      },
    },
    Body: {
      [requestName]: {
        _jsns: namespace,
        ...bodyPayload,
      },
    },
  };

  const response = await fetch(`${BASE_URL}/service/soap/${requestName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(includeAuthorizationHeader ? { Authorization: `Bearer ${token}` } : {}),
      Cookie: `ZM_AUTH_TOKEN=${token};`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  const body = extractSoapBody(data);
  const fault = extractSoapFault(body);

  if (!response.ok || fault) {
    const reason = Array.isArray(fault?.Reason)
      ? fault.Reason?.[0]?.Text
      : fault?.Reason?.Text;
    throw new Error(reason || `${requestName} failed (${response.status})`);
  }

  return extractSoapResponse(body, requestName) as TResponse;
};
