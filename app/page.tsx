import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nelson — Stop starting over.',
  description: 'Streaks break. Momentum doesn\'t. Nelson tracks the momentum you build from your actual behavior, day by day.',
  openGraph: {
    title: 'Nelson — Stop starting over.',
    description: 'Streaks break. Momentum doesn\'t.',
    url: 'https://thenelson.app',
    siteName: 'Nelson',
  },
};

export default function LandingPage() {
  return (
    <main style={{ fontFamily: "'Georgia', 'Times New Roman', serif", backgroundColor: '#ffffff', color: '#111827', margin: 0, padding: 0 }}>

      {/* Nav */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #F1F1F1',
        padding: '0 32px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
          fontSize: '20px',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          color: '#111827',
        }}>
          Nelson
        </span>
        <a
          href="https://apps.apple.com/app/nelson-momentum-tracker/id6762620304"
          style={{
            backgroundColor: '#F59E0B',
            color: '#ffffff',
            textDecoration: 'none',
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            padding: '10px 20px',
            borderRadius: '6px',
          }}
        >
          Download
        </a>
      </nav>

      {/* Hero */}
      <section style={{
        paddingTop: '60px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Hero image */}
        <div style={{
          width: '100%',
          height: '60vh',
          minHeight: '400px',
          backgroundColor: '#F3F4F6',
          backgroundImage: 'url(https://firebasestorage.googleapis.com/v0/b/nelson-7e349.firebasestorage.app/o/hero-image.png?alt=media&token=aafcd754-b0fe-48a4-9924-b13a99d0813b)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }} />

        {/* Hero text */}
        <div style={{
          maxWidth: '680px',
          margin: '0 auto',
          padding: '64px 32px 80px',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: 'clamp(42px, 8vw, 72px)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            color: '#111827',
            margin: '0 0 20px',
          }}>
            Stop starting over.
          </h1>
          <p style={{
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: '20px',
            fontWeight: 500,
            color: '#F59E0B',
            letterSpacing: '0.01em',
            margin: '0 0 28px',
          }}>
            Streaks break. Momentum doesn&apos;t.
          </p>
          <p style={{
            fontSize: '18px',
            lineHeight: 1.7,
            color: '#4B5563',
            margin: '0 0 40px',
          }}>
            Nelson tracks the momentum you build from your actual behavior, day by day.
            One missed day doesn&apos;t erase everything. You just keep going.
          </p>
          <a
            href="https://apps.apple.com/app/nelson-momentum-tracker/id6762620304"
            style={{
              display: 'inline-block',
              backgroundColor: '#111827',
              color: '#ffffff',
              textDecoration: 'none',
              fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
              fontSize: '16px',
              fontWeight: 700,
              padding: '18px 40px',
              borderRadius: '8px',
              letterSpacing: '0.02em',
            }}
          >
            Download on the App Store
          </a>
          <p style={{
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: '13px',
            color: '#9CA3AF',
            margin: '16px 0 0',
          }}>
            Free 14-day trial. iPhone only.
          </p>
        </div>
      </section>

      {/* Streak vs Momentum */}
      <section style={{
        backgroundColor: '#F9FAFB',
        borderTop: '1px solid #F1F1F1',
        borderBottom: '1px solid #F1F1F1',
        padding: '80px 32px',
      }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <p style={{
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#9CA3AF',
            marginBottom: '32px',
            textAlign: 'center',
          }}>
            The difference
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Streak model */}
            <div style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '12px',
              padding: '28px 32px',
            }}>
              <p style={{
                fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#EF4444',
                margin: '0 0 12px',
              }}>
                Streak model
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {['✓', '✓', '✓', '✕'].map((mark, i) => (
                  <span key={i} style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: mark === '✓' ? '#DCFCE7' : '#FEE2E2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    color: mark === '✓' ? '#16A34A' : '#EF4444',
                    fontFamily: 'sans-serif',
                  }}>
                    {mark}
                  </span>
                ))}
                <span style={{
                  fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                  fontSize: '14px',
                  color: '#9CA3AF',
                  margin: '0 4px',
                }}>→</span>
                <span style={{
                  fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                  fontSize: '28px',
                  fontWeight: 800,
                  color: '#EF4444',
                  letterSpacing: '-0.03em',
                }}>
                  ZERO
                </span>
              </div>
              <p style={{
                fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                fontSize: '13px',
                color: '#9CA3AF',
                margin: '12px 0 0',
              }}>
                One miss resets everything. Start over.
              </p>
            </div>

            {/* Momentum model */}
            <div style={{
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '12px',
              padding: '28px 32px',
            }}>
              <p style={{
                fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#D97706',
                margin: '0 0 12px',
              }}>
                Momentum model
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {['✓', '✓', '✓', '–'].map((mark, i) => (
                  <span key={i} style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: mark === '✓' ? '#DCFCE7' : '#FEF3C7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    color: mark === '✓' ? '#16A34A' : '#D97706',
                    fontFamily: 'sans-serif',
                  }}>
                    {mark}
                  </span>
                ))}
                <span style={{
                  fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                  fontSize: '14px',
                  color: '#9CA3AF',
                  margin: '0 4px',
                }}>→</span>
                <span style={{
                  fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#F59E0B',
                }}>
                  momentum continues
                </span>
              </div>
              <p style={{
                fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                fontSize: '13px',
                color: '#9CA3AF',
                margin: '12px 0 0',
              }}>
                Pick up where you left off. Never start over again.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '80px 32px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <p style={{
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#9CA3AF',
            marginBottom: '32px',
            textAlign: 'center',
          }}>
            How it works
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {[
              { label: 'Check in.', body: '7 behaviors. Honest ratings. About a minute. Rate what actually happened, not what you wish happened.' },
              { label: 'Learn.', body: 'One short article from the Learn section. One idea you can apply today. Another minute.' },
              { label: 'Build.', body: 'Every Monday, Nelson reviews your week and sends one focused coaching observation. The pattern shows up over time.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#F59E0B',
                  marginTop: '8px',
                  flexShrink: 0,
                }} />
                <div>
                  <p style={{
                    fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#111827',
                    margin: '0 0 6px',
                  }}>
                    {item.label}
                  </p>
                  <p style={{
                    fontSize: '16px',
                    lineHeight: 1.7,
                    color: '#4B5563',
                    margin: 0,
                  }}>
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section style={{
        backgroundColor: '#0A0F1A',
        padding: '80px 32px',
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)',
            marginBottom: '48px',
            textAlign: 'center',
          }}>
            The app
          </p>
          <div style={{
            display: 'flex',
            gap: '16px',
            overflowX: 'auto',
            paddingBottom: '16px',
            scrollbarWidth: 'none',
          }}>
            {[
              'https://firebasestorage.googleapis.com/v0/b/nelson-7e349.firebasestorage.app/o/Screen1.jpg?alt=media&token=f8928d57-894c-42fa-bd29-66a119e7caa3',
              'https://firebasestorage.googleapis.com/v0/b/nelson-7e349.firebasestorage.app/o/Screen2.jpg?alt=media&token=cb8d468c-a05d-4243-a379-cfb016e43a26',
              'https://firebasestorage.googleapis.com/v0/b/nelson-7e349.firebasestorage.app/o/Screen%203.jpg?alt=media&token=b0e3492c-2889-4ffe-a232-74ae0684a415',
              'https://firebasestorage.googleapis.com/v0/b/nelson-7e349.firebasestorage.app/o/Screen%204.jpg?alt=media&token=4cd90f93-d805-4b84-b99d-8ed6006bb6f6',
            ].map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Nelson app screen ${i + 1}`}
                style={{
                  height: '520px',
                  width: 'auto',
                  borderRadius: '20px',
                  flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{
        padding: '100px 32px',
        textAlign: 'center',
        borderTop: '1px solid #F1F1F1',
      }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
            fontSize: 'clamp(32px, 6vw, 52px)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            color: '#111827',
            margin: '0 0 20px',
          }}>
            Never start over again.
          </h2>
          <p style={{
            fontSize: '18px',
            lineHeight: 1.7,
            color: '#4B5563',
            margin: '0 0 40px',
          }}>
            Built for people who have restarted too many times. Free 14-day trial.
          </p>
          <a
            href="https://apps.apple.com/app/nelson-momentum-tracker/id6762620304"
            style={{
              display: 'inline-block',
              backgroundColor: '#F59E0B',
              color: '#ffffff',
              textDecoration: 'none',
              fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
              fontSize: '16px',
              fontWeight: 700,
              padding: '18px 48px',
              borderRadius: '8px',
              letterSpacing: '0.02em',
            }}
          >
            Download on the App Store
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #F1F1F1',
        padding: '32px',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
          fontSize: '13px',
          color: '#9CA3AF',
          margin: '0 0 8px',
        }}>
          Nelson — thenelson.app — hello@thenelson.app
        </p>
        <p style={{
          fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif",
          fontSize: '12px',
          color: '#D1D5DB',
          margin: 0,
        }}>
          Simpson Holdings LLC, Maryland
        </p>
      </footer>

    </main>
  );
}