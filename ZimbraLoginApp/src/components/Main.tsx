import React from 'react';
import { Button } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MailFolders from './MailFolders';
import MailList from './MailList';
import type { MainStackParamList } from '../navigation/types';

const Stack = createNativeStackNavigator<MainStackParamList>();

const Main: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="MailFolders">
        <Stack.Screen
          name="MailFolders"
          component={MailFolders}
          options={({ navigation }) => ({
            title: 'Mail Folders',
            headerRight: () => (
              <Button
                title="Mail List"
                onPress={() =>
                  navigation.navigate('MailList', {
                    folderId: '2',
                    folderName: 'Inbox',
                  })
                }
              />
            ),
          })}
        />
        <Stack.Screen
          name="MailList"
          component={MailList}
          options={({ route }) => ({
            title: route.params?.folderName || 'Mail List',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default Main;
