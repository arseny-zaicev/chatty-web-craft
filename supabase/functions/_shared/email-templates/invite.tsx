/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './brand.ts'

interface Props { siteName: string; siteUrl: string; confirmationUrl: string }

export const InviteEmail = ({ siteUrl, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to {BRAND.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} alt={BRAND.name} width={BRAND.logoWidth} height={BRAND.logoHeight} style={{ display: "block" }} />
        </Section>
        <Section style={styles.body}>
          <Text style={styles.eyebrow}>{BRAND.name} · Invitation</Text>
          <Heading style={styles.h1}>You've been invited</Heading>
          <Text style={styles.text}>
            You've been invited to join your team workspace inside {BRAND.name}. Accept the invitation to set your password and sign in.
          </Text>
          <Section style={styles.buttonWrap}>
            <Link href={confirmationUrl} style={styles.button}>Accept invitation</Link>
          </Section>
          <Text style={styles.muted}>
            If you weren't expecting this, you can safely ignore this email - no account will be created.
          </Text>
        </Section>
        <Section style={styles.footer}>
          {BRAND.name} · <Link href={siteUrl} style={{ color: BRAND.colors.muted }}>iskra.ae</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
