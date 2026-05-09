/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './brand.ts'

interface Props {
  siteName: string
  siteUrl: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ siteUrl, oldEmail, newEmail, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email change for {BRAND.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} alt={BRAND.name} width={BRAND.logoWidth} height={BRAND.logoHeight} style={{ display: "block" }} />
        </Section>
        <Section style={styles.body}>
          <Text style={styles.eyebrow}>{BRAND.name} · Account</Text>
          <Heading style={styles.h1}>Confirm your email change</Heading>
          <Text style={styles.text}>
            You requested to change your {BRAND.name} email from{' '}
            <Link href={`mailto:${oldEmail}`} style={styles.link}>{oldEmail}</Link> to{' '}
            <Link href={`mailto:${newEmail}`} style={styles.link}>{newEmail}</Link>.
          </Text>
          <Section style={styles.buttonWrap}>
            <Link href={confirmationUrl} style={styles.button}>Confirm change</Link>
          </Section>
          <Text style={styles.muted}>
            If you didn't request this change, please secure your account immediately.
          </Text>
        </Section>
        <Section style={styles.footer}>
          {BRAND.name} · <Link href={siteUrl} style={{ color: BRAND.colors.muted }}>iskra.ae</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
