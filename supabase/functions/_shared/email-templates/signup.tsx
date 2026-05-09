/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './brand.ts'

interface Props { siteName: string; siteUrl: string; recipient: string; confirmationUrl: string }

export const SignupEmail = ({ siteUrl, recipient, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to activate your {BRAND.name} account</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} alt={BRAND.name} width="40" height="40" style={styles.logo} />
        </Section>
        <Section style={styles.body}>
          <Text style={styles.eyebrow}>{BRAND.name} · Account</Text>
          <Heading style={styles.h1}>Confirm your email</Heading>
          <Text style={styles.text}>
            Welcome to {BRAND.name}. Please confirm <Link href={`mailto:${recipient}`} style={styles.link}>{recipient}</Link> to activate your access.
          </Text>
          <Section style={styles.buttonWrap}>
            <Link href={confirmationUrl} style={styles.button}>Verify email</Link>
          </Section>
          <Text style={styles.muted}>
            If the button doesn't work, paste this link into your browser:<br />
            <Link href={confirmationUrl} style={styles.link}>{confirmationUrl}</Link>
          </Text>
        </Section>
        <Section style={styles.footer}>
          {BRAND.name} · <Link href={siteUrl} style={{ color: BRAND.colors.muted }}>iskra.ae</Link><br />
          If you didn't create an account, you can safely ignore this email.
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
