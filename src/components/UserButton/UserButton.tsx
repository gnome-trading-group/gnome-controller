import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Group, Text, UnstyledButton } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import classes from './UserButton.module.css';

export function UserButton() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const fetchEmail = async () => {
      const userAttributes = await fetchAuthSession().catch(() => null);
      if (!userAttributes) return;

      const email = userAttributes.tokens?.idToken?.payload["email"]?.toString();
      let name = userAttributes.tokens?.idToken?.payload["cognito:username"]?.toString();
      if (!email || !name) return;
      if (name.startsWith("IdentityCenter_")) {
        name = name.split("_")[1];
      }

      setEmail(email);
      setName(name);
    };

    fetchEmail();
  }, []);

  return (
    <UnstyledButton className={classes.user}>
      <Group>
        <div style={{ flex: 1 }}>
          <Text size="sm" fw={500}>
            {name}
          </Text>

          <Text c="dimmed" size="xs">
            {email}
          </Text>
        </div>

        <UnstyledButton component="a" href="/logout">
          <IconLogout size={14} stroke={1.5} />
        </UnstyledButton>
      </Group>
    </UnstyledButton>
  );
}
