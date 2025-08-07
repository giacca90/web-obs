import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebObs } from './web-obs';

describe('WebObs', () => {
  let component: WebObs;
  let fixture: ComponentFixture<WebObs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebObs]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WebObs);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
