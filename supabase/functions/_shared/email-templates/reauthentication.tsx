/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './brand.ts'

interface Props { token: string; siteUrl?: string }

export const ReauthenticationEmail = ({ token, siteUrl = 'https://iskra.ae' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {BRAND.name} verification code</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} alt={BRAND.name} width={BRAND.logoWidth} height={BRAND.logoHeight} style={{ display: "block" }} />
        </Section>
        <Section style={styles.body}>
          <Text style={styles.eyebrow}>{BRAND.name} · Verification</Text>
          <Heading style={styles.h1}>Confirm reauthentication</Heading>
          <Text style={styles.text}>Use the code below to confirm your identity:</Text>
          <Text style={styles.code}>{token}</Text>
          <Text style={styles.muted}>
            This code expires shortly. If you didn't request this, you can safely ignore this email.
          </Text>
        </Section>
        <Section style={styles.footer}>
          {BRAND.name} · <Link href={siteUrl} style={{ color: BRAND.colors.muted }}>iskra.ae</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
