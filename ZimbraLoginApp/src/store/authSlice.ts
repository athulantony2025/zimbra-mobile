import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AuthState {
  isLoggedIn: boolean;
  authToken: string | null;
  csrfToken: string | null;
}

const initialState: AuthState = {
  isLoggedIn: false,
  authToken: null,
  csrfToken: null
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login(state, action: PayloadAction<{ authToken: string; csrfToken: string }>) {
      state.isLoggedIn = true;
      state.authToken = action.payload.authToken;
      state.csrfToken = action.payload.csrfToken;
    },
    logout(state) {
      state.isLoggedIn = false;
      state.authToken = null;
      state.csrfToken = null;
    }
  }
});

export const { login, logout } = authSlice.actions;
export default authSlice.reducer;
