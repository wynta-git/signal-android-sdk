let _token = '';

export const getToken = (): string => _token;

export const setRegisteredToken = (token: string): void => {
  _token = token;
};
