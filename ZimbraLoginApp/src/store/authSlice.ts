import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AuthState {
  isLoggedIn: boolean;
  authToken: string | null;
}

const initialState: AuthState = {
  isLoggedIn: false,
  authToken: null,
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
    }
  }
});

export const { login, logout } = authSlice.actions;
export default authSlice.reducer;
