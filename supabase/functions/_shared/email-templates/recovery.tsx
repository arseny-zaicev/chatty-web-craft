/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './brand.ts'

interface Props { siteName: string; siteUrl: string; confirmationUrl: string }

export const RecoveryEmail = ({ siteUrl, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {BRAND.name} password</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} alt={BRAND.name} width="40" height="40" style={styles.logo} />
        </Section>
        <Section style={styles.body}>
          <Text style={styles.eyebrow}>{BRAND.name} · Security</Text>
          <Heading style={styles.h1}>Reset your password</Heading>
          <Text style={styles.text}>
            We received a request to reset your password. Click below to choose a new one. The link expires in 1 hour.
          </Text>
          <Section style={styles.buttonWrap}>
            <Link href={confirmationUrl} style={styles.button}>Reset password</Link>
          </Section>
          <Text style={styles.muted}>
            Didn't request this? You can safely ignore this email - your password won't change.
          </Text>
        </Section>
        <Section style={styles.footer}>
          {BRAND.name} · <Link href={siteUrl} style={{ color: BRAND.colors.muted }}>iskra.ae</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
