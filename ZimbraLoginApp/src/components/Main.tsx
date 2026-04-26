import React, { useEffect } from 'react';
import { Button } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MailFolders from './MailFolders';
import MailList from './MailList';
import ViewMail from './ViewMail';
import type { MainStackParamList } from '../navigation/types';
import { fetchMailTags } from '../SOAP/mailApi';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearMailTags, setMailTags } from '../store/authSlice';

const Stack = createNativeStackNavigator<MainStackParamList>();

const Main: React.FC = () => {
  const dispatch = useAppDispatch();
  const authToken = useAppSelector(state => state.auth.authToken);

  useEffect(() => {
    let cancelled = false;

    const loadTags = async () => {
      if (!authToken) {
        dispatch(clearMailTags());
        return;
      }

      try {
        const { tags } = await fetchMailTags(authToken);
        if (!cancelled) dispatch(setMailTags(tags));
      } catch {
        if (!cancelled) dispatch(clearMailTags());
      }
    };

    void loadTags();

    return () => {
      cancelled = true;
    };
  }, [authToken, dispatch]);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="MailFolders">
        <Stack.Screen
          name="MailFolders"
          component={MailFolders}
          options={({ navigation }) => ({
            title: 'Mail Folders',
          })}
        />
        <Stack.Screen
          name="MailList"
          component={MailList}
          options={({ route }) => ({
            title: route.params?.folderName || 'Mail List',
          })}
        />
        <Stack.Screen
          name="ViewMail"
          component={ViewMail}
          options={({ route }) => ({
            title: route.params?.subject || 'View Mail',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default Main;
