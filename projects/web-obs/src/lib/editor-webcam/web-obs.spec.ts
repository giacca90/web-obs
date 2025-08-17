import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebOBS } from './web-obs';

describe('WebOBS', () => {
  let component: WebOBS;
  let fixture: ComponentFixture<WebOBS>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebOBS],
    }).compileComponents();

    fixture = TestBed.createComponent(WebOBS);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
