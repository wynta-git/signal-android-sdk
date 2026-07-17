#import "WyntaInAppWebViewWindow.h"
#import <WebKit/WebKit.h>

@interface WyntaInAppWebViewWindow ()
@property (nonatomic, strong) UIWindow *overlayWindow;
@end

@implementation WyntaInAppWebViewWindow

- (void)presentWithURL:(NSString *)urlString {
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url) {
        return;
    }

    UIWindowScene *scene = nil;
    if (@available(iOS 13.0, *)) {
        for (UIScene *s in [UIApplication sharedApplication].connectedScenes) {
            if ([s isKindOfClass:[UIWindowScene class]] && s.activationState == UISceneActivationStateForegroundActive) {
                scene = (UIWindowScene *)s;
                break;
            }
        }
    }

    UIWindow *window;
    if (@available(iOS 13.0, *)) {
        window = scene ? [[UIWindow alloc] initWithWindowScene:scene]
                        : [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    } else {
        window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    }
    window.frame = [UIScreen mainScreen].bounds;
    window.windowLevel = UIWindowLevelAlert + 2;
    window.backgroundColor = [UIColor whiteColor];
    window.rootViewController = [[UIViewController alloc] init];
    self.overlayWindow = window;

    UIView *root = window.rootViewController.view;
    root.backgroundColor = [UIColor whiteColor];

    CGFloat topInset = window.safeAreaInsets.top > 0 ? window.safeAreaInsets.top : 20;
    CGFloat barHeight = topInset + 44;

    WKWebView *webView = [[WKWebView alloc] initWithFrame:CGRectMake(
        0, barHeight, root.bounds.size.width, root.bounds.size.height - barHeight)];
    webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [webView loadRequest:[NSURLRequest requestWithURL:url]];
    [root addSubview:webView];

    CGFloat closeSize = 32;
    UIView *closeButton = [[UIView alloc] initWithFrame:CGRectMake(12, topInset + (44 - closeSize) / 2.0, closeSize, closeSize)];
    closeButton.backgroundColor = [UIColor colorWithWhite:0.93 alpha:1.0];
    closeButton.layer.cornerRadius = closeSize / 2.0;

    CGFloat barLength = 12;
    CGFloat barThickness = 1.6;
    UIColor *barColor = [UIColor colorWithRed:0.29 green:0.29 blue:0.29 alpha:1.0];
    UIView *bar1 = [[UIView alloc] initWithFrame:CGRectMake((closeSize - barLength) / 2.0, (closeSize - barThickness) / 2.0, barLength, barThickness)];
    bar1.backgroundColor = barColor;
    bar1.transform = CGAffineTransformMakeRotation(M_PI_4);
    UIView *bar2 = [[UIView alloc] initWithFrame:CGRectMake((closeSize - barLength) / 2.0, (closeSize - barThickness) / 2.0, barLength, barThickness)];
    bar2.backgroundColor = barColor;
    bar2.transform = CGAffineTransformMakeRotation(-M_PI_4);
    [closeButton addSubview:bar1];
    [closeButton addSubview:bar2];

    UITapGestureRecognizer *closeTap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(dismiss)];
    [closeButton addGestureRecognizer:closeTap];
    closeButton.userInteractionEnabled = YES;
    [root addSubview:closeButton];

    window.hidden = NO;
}

- (void)dismiss {
    self.overlayWindow.hidden = YES;
    self.overlayWindow = nil;
}

@end
