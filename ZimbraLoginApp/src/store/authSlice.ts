import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { MailTag } from '../SOAP/types';

export interface AuthState {
  isLoggedIn: boolean;
  authToken: string | null;
  mailTags: MailTag[];
}

const initialState: AuthState = {
  isLoggedIn: false,
  authToken: null,
  mailTags: [],
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login(state, action: PayloadAction<{ authToken: string }>) {
      state.isLoggedIn = true;
      state.authToken = action.payload.authToken;
    },
    logout(state) {
      state.isLoggedIn = false;
      state.authToken = null;
      state.mailTags = [];
    },
    setMailTags(state, action: PayloadAction<MailTag[]>) {
      state.mailTags = action.payload;
    },
    clearMailTags(state) {
      state.mailTags = [];
    },
  }
});

export const { login, logout, setMailTags, clearMailTags } = authSlice.actions;
export default authSlice.reducer;
