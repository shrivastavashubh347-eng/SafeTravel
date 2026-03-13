/**
 * Emergency Handler - SOS Protocol
 * Sends alerts via Nodemailer (email) and generates WhatsApp deep links.
 */

const nodemailer = require('nodemailer');
const { stmts } = require('../db/database');

class EmergencyHandler {
  constructor() {
    this.transporter = null;
    this.initMailer();
  }

  initMailer() {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
      });
      console.log('[Emergency] Email transport configured');
    } else {
      console.log('[Emergency] Email not configured — alerts will be logged only');
    }
  }

  async handleSOS(report, contacts, user, trip) {
    const trackingUrl = `${process.env.HOST || 'http://localhost'}:${process.env.PORT || 3000}/track/${trip.tracking_token}`;
    
    // Log to database
    try {
      stmts.insertEmergencyLog.run({
        trip_id: trip.id,
        user_id: trip.user_id,
        trigger_type: report.triggerType || 'manual',
        report_json: JSON.stringify(report),
        tracking_url: trackingUrl,
        notified_contacts: JSON.stringify(contacts.map(c => c.name))
      });
    } catch (err) {
      console.error('[Emergency] DB log error:', err.message);
    }

    // Send email alerts
    if (contacts.length > 0) {
      await this.sendEmails(report, contacts, user, trip, trackingUrl);
    }

    // Generate WhatsApp links
    const whatsappLinks = this.generateWhatsAppLinks(report, contacts, trackingUrl);

    console.log(`[Emergency] 🚨 SOS processed for trip ${trip.id}`);
    console.log(`[Emergency] Tracking URL: ${trackingUrl}`);
    console.log(`[Emergency] Contacts notified: ${contacts.map(c => c.name).join(', ')}`);

    return { trackingUrl, whatsappLinks };
  }

  async sendEmails(report, contacts, user, trip, trackingUrl) {
    if (!this.transporter) {
      console.log('[Emergency] Email not configured, skipping email alerts');
      return;
    }

    const location = report.lastKnownLocation;
    const mapsLink = location 
      ? `https://www.google.com/maps?q=${location.lat},${location.lng}` 
      : 'Location unavailable';

    const emailHtml = `
      <div style="font-family: 'Arial', sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #ff1744, #ff6b35); padding: 24px; text-align: center;">
          <h1 style="margin: 0; color: white; font-size: 28px;">🚨 EMERGENCY SOS ALERT 🚨</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">SafeTravel Safety System</p>
        </div>
        
        <div style="padding: 24px;">
          <div style="background: rgba(255,23,68,0.1); border: 1px solid rgba(255,23,68,0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h2 style="color: #ff1744; margin: 0 0 8px;">⚡ Trigger: ${report.triggerType === 'auto_deadman_switch' ? 'No Response (Auto-Triggered)' : report.triggerType === 'manual' ? 'Manual SOS Button' : report.triggerType}</h2>
            <p style="margin: 0; color: #ccc;">Time: ${new Date(report.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
          </div>

          <h3 style="color: #ff6b35; border-bottom: 1px solid #333; padding-bottom: 8px;">👤 Person Details</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px; color: #999;">Name:</td><td style="padding: 8px; color: white; font-weight: bold;">${user ? user.name : 'Unknown'}</td></tr>
            <tr><td style="padding: 8px; color: #999;">Phone:</td><td style="padding: 8px;"><a href="tel:${user ? user.phone : ''}" style="color: #4fc3f7;">${user ? user.phone : 'N/A'}</a></td></tr>
            <tr><td style="padding: 8px; color: #999;">Blood Group:</td><td style="padding: 8px; color: #ff6b35; font-weight: bold;">${user ? user.blood_group : 'N/A'}</td></tr>
            <tr><td style="padding: 8px; color: #999;">Medical Info:</td><td style="padding: 8px;">${user ? (user.medical_info || 'None') : 'N/A'}</td></tr>
          </table>

          <h3 style="color: #ff6b35; border-bottom: 1px solid #333; padding-bottom: 8px;">📍 Location</h3>
          <p style="margin: 8px 0;"><a href="${mapsLink}" style="color: #4fc3f7; text-decoration: none; font-size: 16px;">📍 View on Google Maps</a></p>
          <p style="color: #999; font-size: 12px;">Lat: ${location ? location.lat : 'N/A'}, Lng: ${location ? location.lng : 'N/A'}</p>

          ${trip.driver_name ? `
          <h3 style="color: #ff6b35; border-bottom: 1px solid #333; padding-bottom: 8px;">🚗 Vehicle / Driver</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px; color: #999;">Driver:</td><td style="padding: 8px; color: white;">${trip.driver_name}</td></tr>
            <tr><td style="padding: 8px; color: #999;">Vehicle #:</td><td style="padding: 8px; color: #ff6b35; font-weight: bold;">${trip.vehicle_number || 'N/A'}</td></tr>
          </table>` : ''}

          <div style="text-align: center; margin: 24px 0;">
            <a href="${trackingUrl}" style="display: inline-block; background: linear-gradient(135deg, #ff1744, #ff6b35); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">🔴 TRACK LIVE LOCATION</a>
          </div>

          <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; margin-top: 20px;">
            <h4 style="color: #ffd54f; margin: 0 0 8px;">📞 Indian Emergency Numbers</h4>
            <p style="margin: 4px 0;"><a href="tel:112" style="color: #4fc3f7;">112</a> — Police / All Emergencies</p>
            <p style="margin: 4px 0;"><a href="tel:1091" style="color: #4fc3f7;">1091</a> — Women Helpline</p>
            <p style="margin: 4px 0;"><a href="tel:181" style="color: #4fc3f7;">181</a> — Women Helpline (Alt)</p>
            <p style="margin: 4px 0;"><a href="tel:1098" style="color: #4fc3f7;">1098</a> — Child Helpline</p>
          </div>
        </div>

        <div style="background: rgba(0,0,0,0.3); padding: 16px; text-align: center; color: #666; font-size: 12px;">
          SafeTravel Safety App — This is an automated emergency alert
        </div>
      </div>
    `;

    const emailAddresses = contacts.filter(c => c.email).map(c => c.email);
    
    if (emailAddresses.length === 0) {
      console.log('[Emergency] No email addresses in contacts');
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'SafeTravel <noreply@safetravel.app>',
        to: emailAddresses.join(', '),
        subject: `🚨 EMERGENCY SOS: ${user ? user.name : 'A Traveler'} Needs Help!`,
        html: emailHtml
      });
      console.log(`[Emergency] ✅ Email sent to: ${emailAddresses.join(', ')}`);
    } catch (err) {
      console.error('[Emergency] ❌ Email send failed:', err.message);
    }
  }

  generateWhatsAppLinks(report, contacts, trackingUrl) {
    const location = report.lastKnownLocation;
    const user = report.user;
    
    const message = encodeURIComponent(
      `🚨 EMERGENCY SOS ALERT 🚨\n\n` +
      `${user ? user.name : 'Someone'} needs immediate help!\n\n` +
      `📞 Phone: ${user ? user.phone : 'N/A'}\n` +
      `🩸 Blood Group: ${user ? user.blood_group : 'N/A'}\n` +
      `📍 Location: ${location ? `https://www.google.com/maps?q=${location.lat},${location.lng}` : 'Unavailable'}\n\n` +
      `${report.trip ? `🚗 Vehicle: ${report.trip.vehicle_number || 'N/A'}\n👤 Driver: ${report.trip.driver_name || 'N/A'}\n\n` : ''}` +
      `🔴 Track Live: ${trackingUrl}\n\n` +
      `📞 Emergency: 112 (Police) | 1091 (Women) | 181 (Helpline)\n\n` +
      `— SafeTravel Safety App`
    );

    const links = {};
    for (const contact of contacts) {
      if (contact.phone) {
        const phone = contact.phone.replace(/\D/g, '');
        const fullPhone = phone.startsWith('91') ? phone : `91${phone}`;
        links[contact.name] = `https://wa.me/${fullPhone}?text=${message}`;
      }
    }

    return links;
  }
}

module.exports = EmergencyHandler;
