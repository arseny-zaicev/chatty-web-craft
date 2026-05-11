/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Link, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './brand.ts'

interface Props {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  partnerName?: string
}

export const InviteEmail = ({ siteUrl, confirmationUrl, partnerName }: Props) => {
  const hasPartner = !!partnerName
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {hasPartner ? `You've been invited to ${partnerName} on ${BRAND.name}` : `You've been invited to ${BRAND.name}`}
      </Preview>
      <Body style={styles.main}>
        <Container style={inviteCard}>
          <div style={inviteInner}>
            <table cellPadding={0} cellSpacing={0} role="presentation" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: 'middle', width: hasPartner ? '48%' : '100%' }}>
                    <Img src={BRAND.logoUrl} alt={BRAND.name} width={BRAND.logoWidth} height={BRAND.logoHeight} style={{ display: 'block' }} />
                  </td>
                  {hasPartner && <td style={{ verticalAlign: 'middle', width: 34, color: BRAND.colors.muted, fontSize: 22, lineHeight: '22px', textAlign: 'center' }}>×</td>}
                  {hasPartner && (
                    <td style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                      <Text style={partnerWordmark}>{partnerName}</Text>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>

            <Text style={styles.eyebrow}>{hasPartner ? `${partnerName} · Invitation` : `${BRAND.name} · Invitation`}</Text>
            <Heading style={inviteHeading}>You've been invited</Heading>
            <Text style={styles.text}>
              {hasPartner
                ? `You've been invited to join the ${partnerName} workspace on ${BRAND.name}. Accept the invitation to set your password and sign in.`
                : `You've been invited to join your team workspace inside ${BRAND.name}. Accept the invitation to set your password and sign in.`}
            </Text>
            <div style={styles.buttonWrap}>
              <Link href={confirmationUrl} style={styles.button}>Accept invitation</Link>
            </div>
            <Text style={styles.muted}>
              If you weren't expecting this, you can safely ignore this email - no account will be created.
            </Text>
            <div style={inviteFooter}>{BRAND.name} · <Link href={siteUrl} style={{ color: BRAND.colors.muted }}>iskra.ae</Link></div>
          </div>
        </Container>
      </Body>
    </Html>
  )
}

export default InviteEmail

const inviteCard = {
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: BRAND.colors.champagneSoft,
  borderRadius: '16px',
  border: `1px solid ${BRAND.colors.hairline}`,
  overflow: 'hidden',
} as const

const inviteInner = {
  padding: '30px 32px 28px',
} as const

const partnerWordmark = {
  margin: 0,
  fontSize: '20px',
  fontWeight: 600,
  color: BRAND.colors.ink,
  lineHeight: '24px',
  letterSpacing: '0',
} as const

const inviteHeading = {
  ...styles.h1,
  letterSpacing: '0',
} as const

const inviteFooter = {
  marginTop: '28px',
  paddingTop: '18px',
  borderTop: `1px solid ${BRAND.colors.hairline}`,
  fontSize: '12px',
  color: BRAND.colors.muted,
  lineHeight: '1.6',
  textAlign: 'center',
} as const
