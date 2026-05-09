/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './brand.ts'

interface Props { siteName: string; siteUrl: string; confirmationUrl: string }

export const MagicLinkEmail = ({ siteUrl, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {BRAND.name} sign-in link</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} alt={BRAND.name} width="40" height="40" style={styles.logo} />
        </Section>
        <Section style={styles.body}>
          <Text style={styles.eyebrow}>{BRAND.name} · Sign-in</Text>
          <Heading style={styles.h1}>Your sign-in link</Heading>
          <Text style={styles.text}>
            Click below to securely sign in to {BRAND.name}. This link expires shortly and can only be used once.
          </Text>
          <Section style={styles.buttonWrap}>
            <Link href={confirmationUrl} style={styles.button}>Sign in</Link>
          </Section>
          <Text style={styles.muted}>
            If you didn't request this link, you can safely ignore this email.
          </Text>
        </Section>
        <Section style={styles.footer}>
          {BRAND.name} · <Link href={siteUrl} style={{ color: BRAND.colors.muted }}>iskra.ae</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
